// User and Auth types
export interface User {
  id: string;
  email: string;
  name?: string;
  role: "ADMIN" | "MANAGER" | "DISPATCHER" | "EMPLOYEE";
}

// Employee types
export interface Employee {
  id: string;
  name: string;
  role: "chauffeur-livreur" | "aide-livreur";
  isAvailable: boolean;
  phoneNumber?: string;
}

// Truck types
export interface Truck {
  id: string;
  immatriculation: string;
  isAvailable: boolean;
  maintenanceDate?: string;
  insuranceExpiry?: string;
}

// Tour types
export type TourStatus =
  | "imported"
  | "assigned"
  | "notified"
  | "completed"
  | "conflict"
  | "cancelled";
export type TourType = "standard" | "express" | "manual";

export interface Tour {
  id: string;
  tourCode: string;
  platform: string;
  date: string;
  status: TourStatus;
  tourType: TourType;
  chauffeurId?: string;
  aideId?: string;
  truckId?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

// Import types
export type ImportStatus =
  | "pending"
  | "processing"
  | "preview"
  | "committed"
  | "failed";

export interface ImportBatch {
  id: string;
  fileName: string;
  status: ImportStatus;
  rowCount: number;
  errorCount: number;
  uploadedAt: string;
}

export interface ImportRow {
  id: string;
  batchId: string;
  rowNumber: number;
  tourCode: string;
  platform: string;
  date: string;
  transporter: string;
  isValid: boolean;
  errors?: string[];
  rawData: Record<string, any>;
}

// Express Delivery types
export interface ExpressDelivery {
  id: string;
  clientName: string;
  address: string;
  platform: string;
  date: string;
  status: TourStatus;
  chauffeurId?: string;
  aideId?: string;
  truckId?: string;
  notes?: string;
  createdAt: string;
}

// Worked Days types
export interface WorkedDay {
  id: string;
  employeeId: string;
  date: string;
  tourId?: string;
  expressDeliveryId?: string;
  isWorked: boolean;
  notes?: string;
}

// Quality Note types
export interface QualityNote {
  id: string;
  employeeId: string;
  tourId?: string;
  date: string;
  score: number;
  comments?: string;
  source: "boulanger" | "internal";
}

// Assignment types
export interface Assignment {
  tourId: string;
  chauffeurId: string;
  aideId?: string;
  truckId: string;
}
