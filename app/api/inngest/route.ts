import { inngest } from "@/lib/inngest/client";
import { sendDailyNewsSummary, sendSignUpEmail, updateWatchlistPrices } from "@/lib/inngest/functions";
import {serve} from "inngest/next";

export const {GET,POST,PUT} = serve({
    client:inngest,
    // bakcgrounds jobs, functions in the back
    functions:[sendSignUpEmail,sendDailyNewsSummary,updateWatchlistPrices],

})