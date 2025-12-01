import { getUserSpecificWatchListByEmail } from "@/lib/actions/watchlist.actions";
import { WatchlistItem } from "@/database/models/watchlist.model";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const WatchList = async () => {
  const response = await getUserSpecificWatchListByEmail();

  // Handle the response structure like auth actions
  if (!response.success) {
    return <div>Error loading watchlist: {response.error}</div>;
  }

  const watchListData = response.data;

  return (
    <>
      <h1 className="text-2xl font-bold mt-10 text-center">My WatchList</h1>
      <Table className="mt-4">
        <TableCaption>Your personal stock watchlist</TableCaption>
        <TableHeader>
          <TableRow className="">
            <TableHead className="text-center">Symbol</TableHead>
            <TableHead className="text-center">Company</TableHead>
            <TableHead className="text-center">Current Price</TableHead>
            <TableHead className="text-center">Change %</TableHead>
            <TableHead className="text-center">Change</TableHead>
            <TableHead className="text-center">Market Cap</TableHead>
            <TableHead className="text-center">P/E Ratio</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {watchListData?.map((stock: WatchlistItem) => (
            <TableRow key={String(stock._id)}>
              <TableCell className="font-bold text-center">
                {stock.symbol}
              </TableCell>
              <TableCell
                className={`${
                  stock.company === "Microsoft Corp"
                    ? "text-center pl-11"
                    : "text-center"
                }`}
              >
                {stock.company}
              </TableCell>
              <TableCell className="text-center">
                {stock.priceFormatted ||
                  stock.currentPrice?.toFixed(2) ||
                  "N/A"}
              </TableCell>
              <TableCell
                className={`text-center ${
                  stock.changePercent && stock.changePercent >= 0
                    ? "text-green-600"
                    : "text-red-600"
                }`}
              >
                {stock.changePercent
                  ? `${stock.changePercent.toFixed(2)}%`
                  : "N/A"}
              </TableCell>
              <TableCell
                className={`text-center ${
                  stock.changeFormatted?.includes("+")
                    ? "text-green-600"
                    : stock.changeFormatted?.includes("-")
                    ? "text-red-600"
                    : ""
                }`}
              >
                {stock.changeFormatted || "N/A"}
              </TableCell>
              <TableCell className="text-center">
                {stock.marketCap || "N/A"}
              </TableCell>
              <TableCell className="text-center">
                {stock.peRatio || "N/A"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </>
  );
};

export default WatchList;
