import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

interface Column {
  key: string;
  label: string;
  format?: (value: any) => string;
}

interface DataTableProps {
  title: string;
  data: any[];
  columns: Column[];
  highlightPositive?: boolean;
  highlightNegative?: boolean;
}

export function DataTable({ title, data, columns, highlightPositive, highlightNegative }: DataTableProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">{title}</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((col) => (
                <TableHead key={col.key} className="text-xs">
                  {col.label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((row, i) => (
              <TableRow key={i}>
                {columns.map((col) => {
                  const value = row[col.key];
                  const formatted = col.format ? col.format(value) : value;
                  const isChangeCol = col.key === 'change';
                  
                  return (
                    <TableCell 
                      key={col.key}
                      className={cn(
                        "text-sm py-2",
                        isChangeCol && highlightPositive && value > 0 && "text-green-600 dark:text-green-400 font-semibold",
                        isChangeCol && highlightNegative && value < 0 && "text-red-600 dark:text-red-400 font-semibold"
                      )}
                    >
                      {formatted}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
