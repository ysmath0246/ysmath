// src/components/ui/table.jsx
import React from "react";

export function Table({ children, ...rest }) {
  return (
    <table
      {...rest}
      style={{ width: "100%", borderCollapse: "collapse" }}
    >
      {children}
    </table>
  );
}

export function TableHeader({ children, ...rest }) {
  return <thead {...rest}>{children}</thead>;
}

export function TableBody({ children, ...rest }) {
  return <tbody {...rest}>{children}</tbody>;
}

export function TableRow({ children, ...rest }) {
  return <tr {...rest}>{children}</tr>;
}

export function TableHead({ children, ...rest }) {
  return (
    <th
      {...rest}
      style={{
        border: "1px solid #ccc",
        padding: 8,
        textAlign: "center",
        background: "#f5f5f5",
      }}
    >
      {children}
    </th>
  );
}

export function TableCell({ children, ...rest }) {
  return (
    <td
      {...rest}
      style={{
        border: "1px solid #ccc",
        padding: 8,
        textAlign: "center",
      }}
    >
      {children}
    </td>
  );
}
