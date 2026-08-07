export type ProjectStatus = "Active" | "Planning" | "Completed";

export type Project = {
  id: string;
  name: string;
  location: string;
  client: string;
  status: ProjectStatus;
  progress: number;
  peopleToday: number;
  nextDelivery: string;
  manager: string;
};

export type Employee = {
  id: string;
  name: string;
  role: string;
  project: string;
  phone: string;
  status: "On site" | "Office" | "Off";
  certificates: string[];
};

export type DocumentRow = {
  id: string;
  name: string;
  category: string;
  project: string;
  revision: string;
  updated: string;
  status: "Current" | "Review" | "Archived";
};

export type DailyReport = {
  id: string;
  project: string;
  date: string;
  people: number;
  work: string;
  deliveries: number;
  issues: number;
  author: string;
};

export const projects: Project[] = [
  { id: "riga-north", name: "Riga North Residential", location: "Rīga, LV", client: "Nordic Development", status: "Active", progress: 64, peopleToday: 12, nextDelivery: "Today · 10:30", manager: "Edvards K." },
  { id: "marupe-logistics", name: "Mārupe Logistics Hub", location: "Mārupe, LV", client: "Baltic Logistics", status: "Active", progress: 38, peopleToday: 9, nextDelivery: "Tomorrow · 08:00", manager: "Jānis B." },
  { id: "tallinn-office", name: "Tallinn Office Campus", location: "Tallinn, EE", client: "Northline Property", status: "Planning", progress: 8, peopleToday: 0, nextDelivery: "18 Aug · TBD", manager: "Edvards K." },
  { id: "kaunas-retail", name: "Kaunas Retail Extension", location: "Kaunas, LT", client: "Retail Baltic", status: "Completed", progress: 100, peopleToday: 0, nextDelivery: "—", manager: "Mārtiņš S." },
];

export const employees: Employee[] = [
  { id: "emp-001", name: "Jānis Bērziņš", role: "Foreman", project: "Riga North Residential", phone: "+371 2X XXX XXX", status: "On site", certificates: ["Rigger", "First aid"] },
  { id: "emp-002", name: "Mārtiņš Ozols", role: "Precast installer", project: "Riga North Residential", phone: "+371 2X XXX XXX", status: "On site", certificates: ["Work at height"] },
  { id: "emp-003", name: "Artūrs Liepa", role: "Welder", project: "Mārupe Logistics Hub", phone: "+371 2X XXX XXX", status: "On site", certificates: ["EN ISO 9606-1"] },
  { id: "emp-004", name: "Kārlis Kalniņš", role: "Rigger", project: "Mārupe Logistics Hub", phone: "+371 2X XXX XXX", status: "On site", certificates: ["Rigger", "Signalman"] },
  { id: "emp-005", name: "Laura Priede", role: "Project coordinator", project: "Tallinn Office Campus", phone: "+371 2X XXX XXX", status: "Office", certificates: [] },
  { id: "emp-006", name: "Andris Krūmiņš", role: "Concrete worker", project: "Riga North Residential", phone: "+371 2X XXX XXX", status: "Off", certificates: ["Work at height"] },
];

export const documents: DocumentRow[] = [
  { id: "doc-001", name: "PF-DVP-001 Work Execution Plan", category: "DVP", project: "Riga North Residential", revision: "Rev.0", updated: "07 Aug 2026", status: "Current" },
  { id: "doc-002", name: "Precast Installation Method Statement", category: "DOP", project: "Riga North Residential", revision: "Rev.2", updated: "06 Aug 2026", status: "Current" },
  { id: "doc-003", name: "Level 03 Erection Drawing", category: "Drawing", project: "Mārupe Logistics Hub", revision: "C", updated: "05 Aug 2026", status: "Review" },
  { id: "doc-004", name: "Risk Assessment — Lifting Operations", category: "HSE", project: "All projects", revision: "Rev.1", updated: "01 Aug 2026", status: "Current" },
  { id: "doc-005", name: "Old Delivery Schedule", category: "Schedule", project: "Kaunas Retail Extension", revision: "Rev.4", updated: "12 Jun 2026", status: "Archived" },
];

export const reports: DailyReport[] = [
  { id: "rep-001", project: "Riga North Residential", date: "07 Aug 2026", people: 12, work: "Wall panels axes A–C, joint preparation", deliveries: 2, issues: 1, author: "Jānis B." },
  { id: "rep-002", project: "Mārupe Logistics Hub", date: "07 Aug 2026", people: 9, work: "Hollow-core slabs, temporary bracing", deliveries: 1, issues: 0, author: "Mārtiņš S." },
  { id: "rep-003", project: "Riga North Residential", date: "06 Aug 2026", people: 11, work: "External wall panels, welding", deliveries: 2, issues: 0, author: "Jānis B." },
];
