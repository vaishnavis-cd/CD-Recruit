import React from "react";

export interface ColumnDef<T> {
  key: string;
  header: string | React.ReactNode;
  cell: (item: T) => React.ReactNode;
  className?: string;
}

export interface DataTableProps<T> {
  data: T[];
  columns: ColumnDef<T>[];
  keyExtractor: (item: T) => string;
  isLoading?: boolean;
  emptyMessage?: string;
  className?: string;
}

export function DataTable<T>({
  data,
  columns,
  keyExtractor,
  isLoading = false,
  emptyMessage = "No items found",
  className = "",
}: DataTableProps<T>) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8 text-gray-500">
        Loading...
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center p-8 text-gray-500 border rounded-lg bg-gray-50">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className={`overflow-x-auto border rounded-lg shadow-sm ${className}`}>
      <table className="w-full text-left text-sm text-gray-700">
        <thead className="bg-gray-100 text-gray-900 font-semibold border-b">
          <tr>
            {columns.map((col) => (
              <th key={col.key} className={`px-4 py-3 ${col.className || ""}`}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 bg-white">
          {data.map((item) => (
            <tr key={keyExtractor(item)} className="hover:bg-gray-50 transition-colors">
              {columns.map((col) => (
                <td key={col.key} className={`px-4 py-3 ${col.className || ""}`}>
                  {col.cell(item)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
