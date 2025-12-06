'use server';

import { connectToDatabase } from '@/database/mongoose';
import { Watchlist } from '@/database/models/watchlist.model';

export async function getWatchlistSymbolsByEmail(email: string): Promise<string[]> {
  if (!email) return [];

  try {
    const mongoose = await connectToDatabase();
    const db = mongoose.connection.db;
    if (!db) throw new Error('MongoDB connection not found');

    // Better Auth stores users in the "user" collection
    const user = await db.collection('user').findOne<{ _id?: unknown; id?: string; email?: string }>({ email: email.toLowerCase()},{projection: {_id:1, id:1, email:1}});

    if (!user) return [];

    const userId = (user.id as string) || String(user._id || '');
    if (!userId) return [];

    const items = await Watchlist.find({ userId }, { symbol: 1 }).lean();
    return items.map((i) => String(i.symbol));
  } catch (err) {
    console.error('getWatchlistSymbolsByEmail error:', err);
    return [];
  }
}

export async function addToWatchList(symbol: string, company: string): Promise<AddToWatchlistResponse> {
  try {
    const { auth } = await import('@/lib/better-auth/auth');
    const session = await auth.api.getSession({ headers: await import('next/headers').then(h => h.headers()) });

    if (!session?.user?.id) {
      return { success: false, error: 'User not authenticated' };
    }

    const mongoose = await connectToDatabase();
    const db = mongoose.connection.db;
    if (!db) throw new Error('MongoDB connection not found');

    // Check if the stock is already in the watchlist
    const existingItem = await Watchlist.findOne({
      userId: session.user.id,
      symbol: symbol.toUpperCase()
    });

    if (existingItem) {
      return { success: false, error: 'Stock already in watchlist' };
    }

    // Fetch stock data from Finnhub APIs (Quote + Basic Financials)
    const stockData = {
      currentPrice: null as number | null,
      changePercent: null as number | null,
      priceFormatted: null as string | null,
      changeFormatted: null as string | null,
      marketCap: null as string | null,
      peRatio: null as string | null
    };

    try {
      const FINNHUB_BASE_URL = 'https://finnhub.io/api/v1';
      const token = process.env.FINNHUB_API_KEY || process.env.NEXT_PUBLIC_FINNHUB_API_KEY;

      if (token) {
        const symbolUpper = symbol.toUpperCase();

        // Fetch both APIs in parallel
        const [quoteResponse, metricsResponse] = await Promise.all([
          fetch(`${FINNHUB_BASE_URL}/quote?symbol=${encodeURIComponent(symbolUpper)}&token=${token}`),
          fetch(`${FINNHUB_BASE_URL}/stock/metric?symbol=${encodeURIComponent(symbolUpper)}&metric=all&token=${token}`)
        ]);

        // Process quote data
        if (quoteResponse.ok) {
          const quote = await quoteResponse.json();
          if (quote && quote.c !== undefined) {
            stockData.currentPrice = quote.c;
            stockData.changePercent = quote.dp || 0;
            stockData.priceFormatted = `$${quote.c.toFixed(2)}`;
            stockData.changeFormatted = quote.d ? `${quote.d >= 0 ? '+' : ''}$${quote.d.toFixed(2)}` : null;
          }
        }

        // Process metrics data
        if (metricsResponse.ok) {
          const metrics = await metricsResponse.json();
          if (metrics && metrics.metric) {
            const metric = metrics.metric;
            stockData.marketCap = metric.marketCapitalization ? `$${(metric.marketCapitalization / 1000000000).toFixed(2)}B` : null;
            stockData.peRatio = metric.peBasicExclExtraTTM ? metric.peBasicExclExtraTTM.toFixed(2) : null;
          }
        }
      }
    } catch (apiError) {
      console.warn('Failed to fetch stock data from Finnhub:', apiError);
      // Continue without data - don't fail the whole operation
    }

    // Add the stock to the watchlist
    const watchlistItem = new Watchlist({
      userId: session.user.id,
      symbol: symbol.toUpperCase(),
      company: company,
      currentPrice: stockData.currentPrice,
      changePercent: stockData.changePercent,
      priceFormatted: stockData.priceFormatted,
      changeFormatted: stockData.changeFormatted,
      marketCap: stockData.marketCap,
      peRatio: stockData.peRatio
    });

    await watchlistItem.save();

    return { success: true, message: 'Stock added to watchlist successfully' };
  } catch (err) {
    console.error('addToWatchList error:', err);
    return { success: false, error: 'Failed to add stock to watchlist' };
  }
}

export async function getUserSpecificWatchListByEmail(): Promise<WatchlistResponse> {
  try {
    const { auth } = await import('@/lib/better-auth/auth');
    const session = await auth.api.getSession({ headers: await import('next/headers').then(h => h.headers()) });

    if (!session?.user?.id) {
      return { success: false, error: 'User not authenticated' };
    }

    const mongoose = await connectToDatabase();
    const db = mongoose.connection.db;
    if (!db) throw new Error('MongoDB connection not found');

    const watchListStocks = await Watchlist.find({
      userId: session.user.id,
    });

    return { success: true, data: watchListStocks };
  } catch (err) {
    console.error('getUserSpecificWatchListByEmail error:', err);
    return { success: false, error: 'Failed to fetch watchlist' };
  }
}

export async function removeFromWatchList(symbol: string): Promise<AddToWatchlistResponse> {
  try {
    const { auth } = await import('@/lib/better-auth/auth');
    const session = await auth.api.getSession({ headers: await import('next/headers').then(h => h.headers()) });

    if (!session?.user?.id) {
      return { success: false, error: 'User not authenticated' };
    }

    await connectToDatabase();

    // Find and remove the stock from the watchlist
    const deletedItem = await Watchlist.findOneAndDelete({
      userId: session.user.id,
      symbol: symbol.toUpperCase()
    });

    if (!deletedItem) {
      return { success: false, error: 'Stock not found in watchlist' };
    }

    return { success: true, message: 'Stock removed from watchlist successfully' };
  } catch (err) {
    console.error('removeFromWatchList error:', err);
    return { success: false, error: 'Failed to remove stock from watchlist' };
  }
}