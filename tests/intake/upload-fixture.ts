// A tiny company: one completed renovation (the history), one pending estimate, open bills and payroll.
export const upload = {
  format: "greenlight_company_upload_v1",
  as_of_date: "2026-10-06",
  records: {
    company: [{ trade_name: "Test Builders", industry_title: "Construction" }],
    bank_transactions: [
      { id: "bank-1", date: "2026-01-02", amount: "5000.00", running_balance_amount: "50000.00", kind: "deposit_receipt", memo: "Client deposit banked" },
      { id: "bank-2", date: "2026-10-05", amount: "-300.00", running_balance_amount: "60000.00", kind: "wage_payment", memo: "Payroll paid" },
    ],
    bills: [
      { id: "b1", doc_number: "BILL-1", vendor_name: "Landlord", cost_category: "premises", project_id: null, txn_date: "2026-09-20", due_date: "2026-10-14", total_amount: "1000.00" },
      { id: "b2", doc_number: "BILL-2", vendor_name: "Lumber Co", cost_category: "materials", project_id: "p1", txn_date: "2026-01-10", due_date: "2026-02-01", total_amount: "30000.00" },
    ],
    bill_payments: [{ applications: [{ document_id: "b2", amount: "30000.00" }] }],
    payroll_runs: [1, 2, 3, 4].map((w) => ({ id: `run-${w}`, date: `2026-09-${String(10 + w * 5).padStart(2, "0")}`, total_amount: "1500.00", gross_only: true })),
    invoices: [{ id: "i1", doc_number: "INV-1", customer_name: "Old Client", project_id: "p1", due_date: "2026-03-01", total_amount: "45000.00", deposit_applied_amount: "5000.00", retainage_amount: "0.00" }],
    customer_payments: [{ project_id: "p1", txn_date: "2026-03-15", amount: "45000.00", settles: "receivable", applications: [{ document_id: "i1", amount: "40000.00" }] }],
    projects: [{ id: "p1", name: "Renovation for Old Client", customer_name: "Old Client", project_kind: "renovation", status: "completed", contract_amount: "50000.00", started_date: "2026-01-01", completed_date: "2026-03-10" }],
    estimates: [{ id: "est-9", status: "pending", amount: "40000.00", project_kind: "renovation", date: "2026-09-01", customer_name: null }],
  },
};
