import {inngest} from "@/lib/inngest/client"
import { NEWS_SUMMARY_EMAIL_PROMPT, PERSONALIZED_WELCOME_EMAIL_PROMPT } from "./prompts"
import { sendNewsSummaryEmail, sendWelcomeEmail } from "../nodemailer"
import { getAllUsersForNewsEmail } from "../actions/user.actions"
import { getNews } from "@/lib/actions/finnhub.actions";
import { getWatchlistSymbolsByEmail } from "@/lib/actions/watchlist.actions";
import { formatDateToday, getFormattedTodayDate } from "../utils";

export const sendSignUpEmail = inngest.createFunction({
    id: 'sign-up-email'},
    {event: 'app/user.created'},
    async({event,step}) =>{
        const userProfile = `
        - Country: ${event.data.country}
        - Investment Goals: ${event.data.investmentGoals}
        - Risk Tolerance: ${event.data.riskTolerance}
        - Investment Goals: ${event.data.preferredIndustry}   
        `

        const prompt = PERSONALIZED_WELCOME_EMAIL_PROMPT.replace('{{userProfile}}',userProfile)

        const response = await step.ai.infer('generate-welcome-intro', {
            model:step.ai.models.gemini({model: 'gemini-2.5-flash'}),
            
                body:{
                    contents: [
                        {
                            role:'user',
                            parts: [
                                {text:prompt}
                            ]
                        }
                    ]
                }
            
        })

        await step.run('send-welcome-email', async()=>{
            const part = response.candidates?.[0]?.content?.parts?.[0];
            const introText = (part && 'text' in part ? part.text : null) || 'Thanks for joining Fenikkusu. You now have the tools to track markets and make smarter moves.'

            const {data:{email,name}} = event;
            // email logic here
            return await sendWelcomeEmail({email,name,intro:introText})

            return  {
                success:true,
                message: 'Welcome email sent successfully.'
            }
        })
    }
    )

    export const sendDailyNewsSummary = inngest.createFunction(
        {id:'daily-news-summary'},
        // runs everyday at 12 pm UTC
        [{event:'app/send.daily.news'}, {cron:'0 12 * * *'}],
        // [{event:'app/send.daily.news'}, {cron:'* * * * *'}],
        async({step}) =>{
            // get all users for news delivery

            const users = await step.run('get-all-users', getAllUsersForNewsEmail)
            if(!users || users.length ===0) return {success:false, message: 'No users found for news email'};
            // fetch personalized news for each user
                    const results = await step.run('fetch-user-news', async () => {
            const perUser: Array<{ user: UserForNewsEmail; articles: MarketNewsArticle[] }> = [];
            for (const user of users as UserForNewsEmail[]) {
                try {
                    const symbols = await getWatchlistSymbolsByEmail(user.email);
                    let articles = await getNews(symbols);
                    // Enforce max 6 articles per user
                    articles = (articles || []).slice(0, 6);
                    // If still empty, fallback to 2 random popular stocks
                    if (!articles || articles.length === 0) {
                        const randomStocks = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'NVDA', 'META', 'NFLX'];
                        const selectedStocks = randomStocks.sort(() => 0.5 - Math.random()).slice(0, 2);
                        articles = await getNews(selectedStocks);
                        articles = (articles || []).slice(0, 6);
                    }
                    perUser.push({ user, articles });
                } catch (e) {
                    console.error('daily-news: error preparing user news', user.email, e);
                    perUser.push({ user, articles: [] });
                }
            }
            return perUser;
        });

            // summarize these news via AI for each user

            const userNewsSummaries : {user: User, newsContent:string | null}[]=[];

            for(const {user,articles} of results){
                try{
                    // If we have articles, generate AI summary; otherwise provide fallback message
                    if (articles && articles.length > 0) {
                        const prompt = NEWS_SUMMARY_EMAIL_PROMPT.replace('{{newsData}}',JSON.stringify(articles,null,2));

                        const response = await step.ai.infer(`summarize-news-${user.email}`,{
                            model:step.ai.models.gemini({model: 'gemini-2.5-flash'}),
                            body:{
                                contents:[{role:'user',parts:[{text:prompt}]}]
                            }
                        })

                        const part = response.candidates?.[0]?.content?.parts?.[0];
                        const newsContent = (part && 'text' in part ? part.text : null) || 'No market news available at this time.';

                        userNewsSummaries.push({user, newsContent});
                    } else {
                        userNewsSummaries.push({user, newsContent: 'No market news available at this time.'});
                    }
                }
                catch(e){
                    console.error('Failed to summarize news for:', user.email);
                    userNewsSummaries.push({user,newsContent:null});
                }
            }
            
            // send emails

            await step.run('send-news-emails', async ()=>{

                await Promise.all(
                    userNewsSummaries.map(async({user,newsContent})=>{
                        if(!newsContent)return false;

                        return await sendNewsSummaryEmail({email:user.email, date:getFormattedTodayDate(), newsContent})
                    })
                )
            })

            return {success:true, message: 'Daily news summary emails sent successfully'}
        }
    )

export const updateWatchlistPrices = inngest.createFunction({
    id: 'update-watchlist-prices'
}, {cron: '*/5 * * * *'}, // Every 5 minutes
async ({step}) => {
    try {
        // Get all unique symbols from all watchlists
        const uniqueSymbols = await step.run('get-unique-symbols', async () => {
            const { connectToDatabase } = await import('@/database/mongoose');
            const { Watchlist } = await import('@/database/models/watchlist.model');

            await connectToDatabase();
            const symbols = await Watchlist.distinct('symbol');
            return symbols as string[];
        });

        if (!uniqueSymbols || uniqueSymbols.length === 0) {
            return { success: true, message: 'No symbols to update' };
        }

        // Fetch latest prices for all symbols
        const priceUpdates = await step.run('fetch-prices', async () => {
            const FINNHUB_BASE_URL = 'https://finnhub.io/api/v1';
            const token = process.env.FINNHUB_API_KEY || process.env.NEXT_PUBLIC_FINNHUB_API_KEY;

            if (!token) {
                throw new Error('Finnhub API key not configured');
            }

            const updates: Record<string, any> = {};

            // Fetch quotes for all symbols in parallel (limit to 10 concurrent calls)
            const batchSize = 10;
            for (let i = 0; i < uniqueSymbols.length; i += batchSize) {
                const batch = uniqueSymbols.slice(i, i + batchSize);

                const promises = batch.map(async (symbol) => {
                    try {
                        const [quoteResponse, metricsResponse] = await Promise.all([
                            fetch(`${FINNHUB_BASE_URL}/quote?symbol=${encodeURIComponent(symbol)}&token=${token}`),
                            fetch(`${FINNHUB_BASE_URL}/stock/metric?symbol=${encodeURIComponent(symbol)}&metric=all&token=${token}`)
                        ]);

                        const updateData: any = {};

                        // Process quote data
                        if (quoteResponse.ok) {
                            const quote = await quoteResponse.json();
                            if (quote && quote.c !== undefined) {
                                updateData.currentPrice = quote.c;
                                updateData.changePercent = quote.dp || 0;
                                updateData.priceFormatted = `$${quote.c.toFixed(2)}`;
                                updateData.changeFormatted = quote.d ? `${quote.d >= 0 ? '+' : ''}$${quote.d.toFixed(2)}` : null;
                            }
                        }

                        // Process metrics data
                        if (metricsResponse.ok) {
                            const metrics = await metricsResponse.json();
                            if (metrics && metrics.metric) {
                                const metric = metrics.metric;
                                updateData.marketCap = metric.marketCapitalization ? `$${(metric.marketCapitalization / 1000000000).toFixed(2)}B` : null;
                                updateData.peRatio = metric.peBasicExclExtraTTM ? metric.peBasicExclExtraTTM.toFixed(2) : null;
                            }
                        }

                        if (Object.keys(updateData).length > 0) {
                            updates[symbol] = updateData;
                        }
                    } catch (error) {
                        console.warn(`Failed to fetch data for ${symbol}:`, error);
                    }
                });

                await Promise.all(promises);

                // Small delay between batches to avoid rate limiting
                if (i + batchSize < uniqueSymbols.length) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            }

            return updates;
        });

        // Update all watchlist entries with new prices
        const updateResults = await step.run('update-watchlists', async () => {
            const { connectToDatabase } = await import('@/database/mongoose');
            const { Watchlist } = await import('@/database/models/watchlist.model');

            await connectToDatabase();

            let updatedCount = 0;

            for (const [symbol, updateData] of Object.entries(priceUpdates)) {
                try {
                    const result = await Watchlist.updateMany(
                        { symbol: symbol },
                        { $set: updateData }
                    );
                    updatedCount += result.modifiedCount || 0;
                } catch (error) {
                    console.error(`Failed to update watchlist for ${symbol}:`, error);
                }
            }

            return { updatedCount, totalSymbols: Object.keys(priceUpdates).length };
        });

        return {
            success: true,
            message: `Updated prices for ${updateResults.updatedCount} watchlist entries across ${updateResults.totalSymbols} symbols`
        };

    } catch (error) {
        console.error('updateWatchlistPrices error:', error);
        return { success: false, error: 'Failed to update watchlist prices' };
    }
})