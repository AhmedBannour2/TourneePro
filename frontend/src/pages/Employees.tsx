import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  UserPlus, Pencil, UserX, UserCheck, KeyRound, ShieldCheck,
  Phone, MapPin, Calendar, Truck as TruckIcon, Search,
  Upload, Download, Trash2, FileText, Loader2, User, DollarSign,
} from 'lucide-react';
import { usePageTitle } from '@/hooks/usePageTitle';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ToastContainer } from '@/components/ui/toast';
import { useToast } from '@/hooks/useToast';

// ── Types ──────────────────────────────────────────────────────────────────────

interface Employee {
  id: string;
  name: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  role: 'CHAUFFEUR' | 'AIDE' | 'BOTH';
  address: string | null;
  isActive: boolean;
  createdAt: string;
  userId: string | null;
  user: { email: string } | null;
  responsibleTruck: { id: string; immatriculation: string } | null;
}

interface EmployeeDocument {
  id: string;
  employeeId: string;
  fileName: string;
  originalName: string;
  fileType: 'ID' | 'PASSPORT' | 'CV' | 'OTHER';
  mimeType: string;
  uploadedAt: string;
  uploadedBy: { email: string } | null;
}

interface ToursResponse {
  meta: { total: number };
}

type TourType = 'STANDARD' | 'GV' | 'INSTALL' | 'MONO' | 'SPECIAL';

interface PayRate {
  tourType: TourType;
  chauffeurRate: number;
  aideRate: number | null;
  isCustomChauffeur: boolean;
  isCustomAide: boolean;
  systemChauffeurRate: number;
  systemAideRate: number | null;
}

const TOUR_TYPE_LABELS: Record<TourType, string> = {
  STANDARD: 'Standard',
  GV: 'GV',
  INSTALL: 'Install',
  MONO: 'Mono',
  SPECIAL: 'Spéciale',
};

// ── Constants ──────────────────────────────────────────────────────────────────

const ROLE_COLORS: Record<string, string> = {
  CHAUFFEUR: 'bg-blue-100 text-blue-800',
  AIDE: 'bg-green-100 text-green-800',
  BOTH: 'bg-purple-100 text-purple-800',
};

const DOC_TYPE_OPTIONS = [
  { value: 'ID', label: "Carte d'identité" },
  { value: 'PASSPORT', label: 'Passeport' },
  { value: 'CV', label: 'CV' },
  { value: 'OTHER', label: 'Autre' },
] as const;

const DOC_TYPE_COLORS: Record<string, string> = {
  ID: 'bg-blue-100 text-blue-800',
  PASSPORT: 'bg-indigo-100 text-indigo-800',
  CV: 'bg-emerald-100 text-emerald-800',
  OTHER: 'bg-gray-100 text-gray-700',
};

// ── Validation schemas ─────────────────────────────────────────────────────────

const employeeSchema = z.object({
  firstName: z.string().min(1, 'Prénom requis'),
  lastName: z.string().min(1, 'Nom requis'),
  role: z.enum(['CHAUFFEUR', 'AIDE', 'BOTH']),
  phone: z.string().optional().or(z.literal('')),
  address: z.string().optional().or(z.literal('')),
});
type EmployeeFormData = z.infer<typeof employeeSchema>;

const accountSchema = z.object({
  email: z.string().email('Email valide requis'),
  password: z.string().min(6, 'Minimum 6 caractères'),
});
type AccountFormData = z.infer<typeof accountSchema>;

const editAccountSchema = z.object({
  email: z.string().email('Email valide requis'),
  password: z.string().min(6, 'Minimum 6 caractères').optional().or(z.literal('')),
});
type EditAccountFormData = z.infer<typeof editAccountSchema>;

// ── Component ──────────────────────────────────────────────────────────────────

export default function Employees() {
  usePageTitle('Employés');
  const queryClient = useQueryClient();
  const { toasts, removeToast, success, error } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  // Add/Edit dialog
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);

  // Create/Edit Account dialog
  const [isAccountOpen, setIsAccountOpen] = useState(false);
  const [isEditAccount, setIsEditAccount] = useState(false);
  const [accountEmployee, setAccountEmployee] = useState<Employee | null>(null);

  // Profile panel
  const [panelEmployee, setPanelEmployee] = useState<Employee | null>(null);

  // Delete confirm
  const [deletingEmployee, setDeletingEmployee] = useState<Employee | null>(null);

  // Document upload state
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadFileType, setUploadFileType] = useState<string>('OTHER');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');

  // Pay rate editing state
  const [editingRates, setEditingRates] = useState<Record<string, { chauffeurRate: string; aideRate: string }>>({});

  // ── Employee form ────────────────────────────────────────────────────────────

  const {
    register, handleSubmit, reset, setValue, watch,
    formState: { errors },
  } = useForm<EmployeeFormData>({
    resolver: zodResolver(employeeSchema),
    defaultValues: { role: 'CHAUFFEUR' },
  });
  const roleValue = watch('role');

  // ── Account form (create) ─────────────────────────────────────────────────

  const {
    register: registerAccount,
    handleSubmit: handleAccountSubmit,
    reset: resetAccount,
    formState: { errors: accountErrors },
  } = useForm<AccountFormData>({ resolver: zodResolver(accountSchema) });

  // ── Account form (edit) ───────────────────────────────────────────────────

  const {
    register: registerEditAccount,
    handleSubmit: handleEditAccountSubmit,
    reset: resetEditAccount,
    formState: { errors: editAccountErrors },
  } = useForm<EditAccountFormData>({ resolver: zodResolver(editAccountSchema) });

  // ── Queries ──────────────────────────────────────────────────────────────────

  const { data: employees, isLoading } = useQuery({
    queryKey: ['employees'],
    queryFn: () => api.get<Employee[]>('/employees').then((r) => r.data),
  });

  const { data: documents, isLoading: docsLoading } = useQuery({
    queryKey: ['employee-documents', panelEmployee?.id],
    queryFn: () =>
      api.get<EmployeeDocument[]>(`/employees/${panelEmployee!.id}/documents`).then((r) => r.data),
    enabled: !!panelEmployee,
  });

  const { data: payRates, isLoading: ratesLoading } = useQuery<PayRate[]>({
    queryKey: ['employee-pay-rates', panelEmployee?.id],
    queryFn: () =>
      api.get<PayRate[]>(`/employees/${panelEmployee!.id}/pay-rates`).then((r) => r.data),
    enabled: !!panelEmployee,
  });

  const today = new Date().toISOString().split('T')[0];
  const { data: upcomingData } = useQuery({
    queryKey: ['employee-upcoming', panelEmployee?.id],
    queryFn: () =>
      api
        .get<ToursResponse>('/tours', {
          params: { chauffeurId: panelEmployee!.id, dateFrom: today, limit: 1 },
        })
        .then((r) => r.data),
    enabled: !!panelEmployee,
  });

  // ── Mutations ─────────────────────────────────────────────────────────────────

  const createMutation = useMutation({
    mutationFn: (data: EmployeeFormData) => api.post('/employees', data),
    onSuccess: () => {
      success('Employé créé');
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      setIsFormOpen(false);
      reset();
    },
    onError: (err: any) => error(err.response?.data?.message || 'Erreur création'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: EmployeeFormData }) =>
      api.patch(`/employees/${id}`, data),
    onSuccess: (res) => {
      success('Employé mis à jour');
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      if (panelEmployee?.id === editingEmployee?.id) setPanelEmployee(res.data);
      setIsFormOpen(false);
      setEditingEmployee(null);
      reset();
    },
    onError: (err: any) => error(err.response?.data?.message || 'Erreur mise à jour'),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api.patch(`/employees/${id}`, { isActive }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['employees'] }),
    onError: (err: any) => error(err.response?.data?.message || 'Erreur statut'),
  });

  const createAccountMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: AccountFormData }) =>
      api.post(`/employees/${id}/create-account`, data),
    onSuccess: () => {
      success('Compte créé');
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      setIsAccountOpen(false);
      resetAccount();
      setAccountEmployee(null);
    },
    onError: (err: any) => error(err.response?.data?.message || 'Erreur création compte'),
  });

  const hardDeleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/employees/${id}/hard`),
    onSuccess: () => {
      success('Employé supprimé');
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      setDeletingEmployee(null);
      if (panelEmployee?.id === deletingEmployee?.id) setPanelEmployee(null);
    },
    onError: (err: any) => error(err.response?.data?.message || 'Erreur suppression'),
  });

  const updateAccountMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: EditAccountFormData }) =>
      api.patch(`/employees/${id}/account`, data),
    onSuccess: () => {
      success('Compte mis à jour');
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      setIsAccountOpen(false);
      setIsEditAccount(false);
      resetEditAccount();
      setAccountEmployee(null);
    },
    onError: (err: any) => error(err.response?.data?.message || 'Erreur mise à jour compte'),
  });

  const deleteDocMutation = useMutation({
    mutationFn: ({ empId, docId }: { empId: string; docId: string }) =>
      api.delete(`/employees/${empId}/documents/${docId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employee-documents', panelEmployee?.id] });
      success('Document supprimé');
    },
    onError: () => error('Erreur suppression document'),
  });

  const savePayRatesMutation = useMutation({
    mutationFn: (rates: { tourType: string; chauffeurRate: number; aideRate?: number | null }[]) =>
      api.put(`/employees/${panelEmployee!.id}/pay-rates`, { rates }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employee-pay-rates', panelEmployee?.id] });
      setEditingRates({});
      success('Tarifs enregistrés');
    },
    onError: (e: any) => error(e.response?.data?.message || 'Erreur enregistrement'),
  });

  // ── Handlers ──────────────────────────────────────────────────────────────────

  const openCreate = () => {
    setEditingEmployee(null);
    reset({ role: 'CHAUFFEUR', firstName: '', lastName: '', phone: '', address: '' });
    setIsFormOpen(true);
  };

  const openEdit = (emp: Employee) => {
    setEditingEmployee(emp);
    const parts = emp.name.split(' ');
    setValue('firstName', emp.firstName ?? parts[0] ?? '');
    setValue('lastName', emp.lastName ?? parts.slice(1).join(' ') ?? '');
    setValue('role', emp.role);
    setValue('phone', emp.phone ?? '');
    setValue('address', emp.address ?? '');
    setIsFormOpen(true);
  };

  const onEmployeeSubmit = (data: EmployeeFormData) => {
    if (editingEmployee) updateMutation.mutate({ id: editingEmployee.id, data });
    else createMutation.mutate(data);
  };

  const openAccountDialog = (emp: Employee) => {
    setAccountEmployee(emp);
    setIsEditAccount(false);
    resetAccount();
    setIsAccountOpen(true);
  };

  const openEditAccountDialog = (emp: Employee) => {
    setAccountEmployee(emp);
    setIsEditAccount(true);
    resetEditAccount({ email: emp.user?.email ?? '', password: '' });
    setIsAccountOpen(true);
  };

  const handleUploadDocument = async () => {
    if (!uploadFile || !panelEmployee) return;
    setIsUploading(true);
    setUploadError('');
    try {
      const fd = new FormData();
      fd.append('file', uploadFile);
      fd.append('fileType', uploadFileType);
      await api.post(`/employees/${panelEmployee.id}/documents`, fd);
      queryClient.invalidateQueries({ queryKey: ['employee-documents', panelEmployee.id] });
      setUploadFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      success('Document uploadé');
    } catch (err: any) {
      setUploadError(err.response?.data?.message || "Erreur upload");
    } finally {
      setIsUploading(false);
    }
  };

  const handleDownload = async (doc: EmployeeDocument) => {
    if (!panelEmployee) return;
    try {
      const res = await api.get(
        `/employees/${panelEmployee.id}/documents/${doc.id}/download`,
        { responseType: 'blob' },
      );
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', doc.originalName);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      error('Erreur téléchargement');
    }
  };

  // Reset upload state when panel closes
  useEffect(() => {
    if (!panelEmployee) {
      setUploadFile(null);
      setUploadError('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [panelEmployee]);

  // ── Filtered list ─────────────────────────────────────────────────────────────

  const filtered = (employees ?? []).filter((emp) => {
    const q = searchQuery.toLowerCase();
    const matchSearch = !q || emp.name.toLowerCase().includes(q);
    const matchRole = roleFilter === 'all' || emp.role === roleFilter;
    const matchStatus =
      statusFilter === 'all' ||
      (statusFilter === 'active' && emp.isActive) ||
      (statusFilter === 'inactive' && !emp.isActive);
    return matchSearch && matchRole && matchStatus;
  });

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <ToastContainer toasts={toasts} removeToast={removeToast} />

      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl md:text-2xl font-bold">Employés</h1>
        <Button onClick={openCreate} size="sm" className="h-9">
          <UserPlus className="w-4 h-4 mr-1.5" /> Ajouter
        </Button>
      </div>

      {/* Filter bar */}
      <Card className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="Rechercher par nom..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger><SelectValue placeholder="Rôle" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les rôles</SelectItem>
              <SelectItem value="CHAUFFEUR">Chauffeur</SelectItem>
              <SelectItem value="AIDE">Aide</SelectItem>
              <SelectItem value="BOTH">Les deux</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger><SelectValue placeholder="Statut" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les statuts</SelectItem>
              <SelectItem value="active">Actif</SelectItem>
              <SelectItem value="inactive">Inactif</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      {/* ── Desktop table ───────────────────────────────────────────────────────── */}
      <div className="hidden md:block bg-white border rounded-lg">
        {isLoading ? (
          <div className="p-6 space-y-3">
            {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-16 text-center">
            <User className="h-12 w-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">Aucun employé trouvé</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                {['Nom complet', 'Rôle', 'Téléphone', 'Statut', 'Compte', 'Actions'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left font-medium text-gray-700">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((emp) => (
                <tr key={emp.id} className="border-t hover:bg-gray-50 cursor-pointer" onClick={() => setPanelEmployee(emp)}>
                  <td className="px-4 py-3 font-medium">{emp.name}</td>
                  <td className="px-4 py-3"><Badge className={ROLE_COLORS[emp.role] ?? 'bg-gray-100 text-gray-700'}>{emp.role}</Badge></td>
                  <td className="px-4 py-3 text-gray-600">
                    {emp.phone ? <div className="flex items-center gap-1"><Phone className="w-3 h-3" />{emp.phone}</div> : <span className="text-gray-400">—</span>}
                  </td>
                  <td className="px-4 py-3"><Badge className={emp.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-500'}>{emp.isActive ? 'Actif' : 'Inactif'}</Badge></td>
                  <td className="px-4 py-3 text-sm">
                    {emp.user?.email ? <span className="flex items-center gap-1 text-indigo-700"><ShieldCheck className="w-3.5 h-3.5" />{emp.user.email}</span> : <span className="text-gray-400">Pas de compte</span>}
                  </td>
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="sm" title={emp.isActive ? 'Désactiver' : 'Activer'} onClick={() => toggleMutation.mutate({ id: emp.id, isActive: !emp.isActive })}>
                        {emp.isActive ? <UserX className="w-4 h-4 text-red-500" /> : <UserCheck className="w-4 h-4 text-green-600" />}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => openEdit(emp)}><Pencil className="w-4 h-4" /></Button>
                      {emp.userId
                        ? <Button variant="ghost" size="sm" title="Modifier le compte" onClick={() => openEditAccountDialog(emp)}><Pencil className="w-4 h-4 text-indigo-600" /></Button>
                        : <Button variant="ghost" size="sm" onClick={() => openAccountDialog(emp)}><KeyRound className="w-4 h-4 text-indigo-600" /></Button>}
                      <Button variant="ghost" size="sm" title="Supprimer" onClick={() => setDeletingEmployee(emp)}>
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Mobile cards ────────────────────────────────────────────────────────── */}
      <div className="block md:hidden space-y-3">
        {isLoading ? (
          [...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center text-gray-400">
            <User className="h-10 w-10 mx-auto mb-2 opacity-30" />
            <p>Aucun employé trouvé</p>
          </div>
        ) : (
          filtered.map((emp) => (
            <div
              key={emp.id}
              onClick={() => setPanelEmployee(emp)}
              className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm cursor-pointer active:bg-gray-50 transition-colors"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap mb-1">
                    <span className="text-sm font-semibold truncate">{emp.name}</span>
                    <Badge className={`text-[10px] h-5 px-1.5 flex-shrink-0 ${ROLE_COLORS[emp.role] ?? 'bg-gray-100 text-gray-700'}`}>{emp.role}</Badge>
                    <Badge className={`text-[10px] h-5 px-1.5 flex-shrink-0 ${emp.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-500'}`}>{emp.isActive ? 'Actif' : 'Inactif'}</Badge>
                  </div>
                  {emp.phone && (
                    <div className="flex items-center gap-1 text-xs text-gray-500 leading-snug">
                      <Phone className="w-3 h-3 flex-shrink-0" /><span className="truncate">{emp.phone}</span>
                    </div>
                  )}
                  {emp.responsibleTruck && (
                    <div className="flex items-center gap-1 mt-0.5">
                      <TruckIcon className="w-3 h-3 text-blue-400 flex-shrink-0" />
                      <span className="font-mono text-[10px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">{emp.responsibleTruck.immatriculation}</span>
                    </div>
                  )}
                </div>
                <div className="flex gap-1 flex-shrink-0 touch-compact" onClick={(e) => e.stopPropagation()}>
                  <Button variant="ghost" size="sm" className="h-9 w-9 p-0" onClick={() => openEdit(emp)}><Pencil className="w-4 h-4" /></Button>
                  <Button variant="ghost" size="sm" className="h-9 w-9 p-0" onClick={() => toggleMutation.mutate({ id: emp.id, isActive: !emp.isActive })}>
                    {emp.isActive ? <UserX className="w-4 h-4 text-red-500" /> : <UserCheck className="w-4 h-4 text-green-600" />}
                  </Button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* ── Add/Edit Dialog ─────────────────────────────────────────────────────── */}
      <Dialog open={isFormOpen} onOpenChange={(o) => { if (!o) { setIsFormOpen(false); setEditingEmployee(null); reset(); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingEmployee ? 'Modifier l\'employé' : 'Nouvel employé'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onEmployeeSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="firstName">Prénom <span className="text-red-500">*</span></Label>
                <Input id="firstName" {...register('firstName')} placeholder="Jean"
                  className={errors.firstName ? 'border-red-500' : ''} />
                {errors.firstName && <p className="text-xs text-red-600">{errors.firstName.message}</p>}
              </div>
              <div className="space-y-1">
                <Label htmlFor="lastName">Nom <span className="text-red-500">*</span></Label>
                <Input id="lastName" {...register('lastName')} placeholder="Dupont"
                  className={errors.lastName ? 'border-red-500' : ''} />
                {errors.lastName && <p className="text-xs text-red-600">{errors.lastName.message}</p>}
              </div>
            </div>
            <div className="space-y-1">
              <Label>Rôle <span className="text-red-500">*</span></Label>
              <Select value={roleValue} onValueChange={(v) => setValue('role', v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="CHAUFFEUR">Chauffeur-livreur</SelectItem>
                  <SelectItem value="AIDE">Aide-livreur</SelectItem>
                  <SelectItem value="BOTH">Les deux</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="phone">Téléphone</Label>
              <Input id="phone" {...register('phone')} placeholder="+33 6 12 34 56 78" type="tel" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="address">Adresse</Label>
              <Input id="address" {...register('address')} placeholder="12 rue de la Paix, 75001 Paris" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => { setIsFormOpen(false); reset(); }}>Annuler</Button>
              <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                {createMutation.isPending || updateMutation.isPending
                  ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Enregistrement...</>
                  : editingEmployee ? 'Mettre à jour' : 'Créer'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirmation Dialog ──────────────────────────────────────────── */}
      <Dialog open={!!deletingEmployee} onOpenChange={(o) => { if (!o) setDeletingEmployee(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <Trash2 className="w-4 h-4" /> Supprimer l'employé
            </DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-2">
            <p className="text-sm text-gray-700">
              Supprimer définitivement <strong>{deletingEmployee?.name}</strong> ?
            </p>
            <p className="text-xs text-red-600">
              Cette action est irréversible. Le compte applicatif sera également supprimé.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingEmployee(null)}>Annuler</Button>
            <Button
              className="bg-red-600 hover:bg-red-700 text-white"
              disabled={hardDeleteMutation.isPending}
              onClick={() => deletingEmployee && hardDeleteMutation.mutate(deletingEmployee.id)}
            >
              {hardDeleteMutation.isPending
                ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Suppression...</>
                : 'Supprimer définitivement'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Create / Edit Account Dialog ────────────────────────────────────────── */}
      <Dialog open={isAccountOpen} onOpenChange={(o) => {
        if (!o) { setIsAccountOpen(false); setIsEditAccount(false); resetAccount(); resetEditAccount(); setAccountEmployee(null); }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {isEditAccount ? 'Modifier le compte' : 'Créer un compte'} — {accountEmployee?.name}
            </DialogTitle>
          </DialogHeader>

          {isEditAccount ? (
            <form onSubmit={handleEditAccountSubmit((data) => {
              if (accountEmployee) updateAccountMutation.mutate({ id: accountEmployee.id, data });
            })} className="space-y-4">
              <div className="space-y-1">
                <Label htmlFor="edit-acc-email">Email <span className="text-red-500">*</span></Label>
                <Input id="edit-acc-email" type="email" {...registerEditAccount('email')} placeholder="driver@stp.fr"
                  className={editAccountErrors.email ? 'border-red-500' : ''} />
                {editAccountErrors.email && <p className="text-xs text-red-600">{editAccountErrors.email.message}</p>}
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-acc-pwd">Nouveau mot de passe</Label>
                <Input id="edit-acc-pwd" type="password" {...registerEditAccount('password')}
                  placeholder="Laisser vide pour ne pas changer"
                  className={editAccountErrors.password ? 'border-red-500' : ''} />
                {editAccountErrors.password && <p className="text-xs text-red-600">{editAccountErrors.password.message}</p>}
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsAccountOpen(false)}>Annuler</Button>
                <Button type="submit" disabled={updateAccountMutation.isPending}>
                  {updateAccountMutation.isPending
                    ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Enregistrement...</>
                    : 'Enregistrer'}
                </Button>
              </DialogFooter>
            </form>
          ) : (
            <form onSubmit={handleAccountSubmit((data) => {
              if (accountEmployee) createAccountMutation.mutate({ id: accountEmployee.id, data });
            })} className="space-y-4">
              <div className="space-y-1">
                <Label htmlFor="acc-email">Email <span className="text-red-500">*</span></Label>
                <Input id="acc-email" type="email" {...registerAccount('email')} placeholder="driver@stp.fr"
                  className={accountErrors.email ? 'border-red-500' : ''} />
                {accountErrors.email && <p className="text-xs text-red-600">{accountErrors.email.message}</p>}
              </div>
              <div className="space-y-1">
                <Label htmlFor="acc-pwd">Mot de passe <span className="text-red-500">*</span></Label>
                <Input id="acc-pwd" type="password" {...registerAccount('password')} placeholder="Min. 6 caractères"
                  className={accountErrors.password ? 'border-red-500' : ''} />
                {accountErrors.password && <p className="text-xs text-red-600">{accountErrors.password.message}</p>}
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsAccountOpen(false)}>Annuler</Button>
                <Button type="submit" disabled={createAccountMutation.isPending}>
                  {createAccountMutation.isPending
                    ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Création...</>
                    : 'Créer le compte'}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Profile Side Panel ───────────────────────────────────────────────────── */}
      <Sheet open={!!panelEmployee} onOpenChange={(o) => !o && setPanelEmployee(null)}>
        <SheetContent side="right" className="md:max-w-md w-full p-0 flex flex-col overflow-hidden">
          {panelEmployee && (
            <>
              {/* Panel header */}
              <SheetHeader className="px-6 pt-6 pb-4 border-b shrink-0">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-lg font-bold text-blue-700 shrink-0">
                    {panelEmployee.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <SheetTitle className="text-lg">{panelEmployee.name}</SheetTitle>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Badge className={ROLE_COLORS[panelEmployee.role] ?? ''}>{panelEmployee.role}</Badge>
                      <Badge className={panelEmployee.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-500'}>
                        {panelEmployee.isActive ? 'Actif' : 'Inactif'}
                      </Badge>
                    </div>
                  </div>
                </div>
              </SheetHeader>

              <Tabs defaultValue="info" className="flex flex-col flex-1 min-h-0 overflow-hidden">
                <TabsList className="w-full rounded-none border-b bg-white shrink-0 px-0">
                  <TabsTrigger value="info" className="flex-1 rounded-none">Informations</TabsTrigger>
                  <TabsTrigger value="documents" className="flex-1 rounded-none">Documents</TabsTrigger>
                  <TabsTrigger value="pay-rates" className="flex-1 rounded-none">
                    <DollarSign className="w-3.5 h-3.5 mr-1" />Tarifs
                  </TabsTrigger>
                </TabsList>

                {/* ── Info tab ──────────────────────────────────────────────────── */}
                <TabsContent value="info" className="flex-1 min-h-0 overflow-y-auto px-6 py-5 space-y-5">
                  {/* Contact */}
                  <div className="space-y-3">
                    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Contact</h3>
                    {panelEmployee.phone ? (
                      <a href={`tel:${panelEmployee.phone}`}
                        className="flex items-center gap-2 text-sm text-gray-800 hover:text-indigo-600">
                        <Phone className="w-4 h-4 text-gray-400" />{panelEmployee.phone}
                      </a>
                    ) : <p className="text-sm text-gray-400">Pas de téléphone renseigné</p>}
                    {panelEmployee.address ? (
                      <div className="flex items-start gap-2 text-sm text-gray-800">
                        <MapPin className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />{panelEmployee.address}
                      </div>
                    ) : <p className="text-sm text-gray-400">Pas d'adresse renseignée</p>}
                  </div>

                  {/* Camion assigné */}
                  <div className="border-t pt-4 space-y-2">
                    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Camion assigné</h3>
                    {panelEmployee.responsibleTruck ? (
                      <div className="flex items-center gap-2">
                        <TruckIcon className="w-4 h-4 text-blue-500" />
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-sm font-semibold bg-blue-100 text-blue-800">
                          {panelEmployee.responsibleTruck.immatriculation}
                        </span>
                      </div>
                    ) : (
                      <p className="text-sm text-gray-400">Aucun camion assigné</p>
                    )}
                  </div>

                  {/* Account */}
                  <div className="border-t pt-4 space-y-2">
                    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Compte applicatif</h3>
                    {panelEmployee.user?.email ? (
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 text-sm min-w-0">
                          <ShieldCheck className="w-4 h-4 text-green-600 shrink-0" />
                          <span className="text-gray-800 truncate">{panelEmployee.user.email}</span>
                        </div>
                        <Button size="sm" variant="outline" className="shrink-0" onClick={() => openEditAccountDialog(panelEmployee)}>
                          <Pencil className="w-3.5 h-3.5 mr-1" /> Modifier
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3">
                        <span className="text-sm text-gray-400">Aucun compte créé</span>
                        <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); openAccountDialog(panelEmployee); }}>
                          <KeyRound className="w-3.5 h-3.5 mr-1" /> Créer
                        </Button>
                      </div>
                    )}
                  </div>

                  {/* Stats */}
                  <div className="border-t pt-4 grid grid-cols-2 gap-3">
                    <div className="bg-blue-50 rounded-lg p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <TruckIcon className="w-4 h-4 text-blue-600" />
                        <span className="text-xs text-blue-600 font-medium">Tournées à venir</span>
                      </div>
                      <p className="text-2xl font-bold text-blue-700">
                        {upcomingData?.meta?.total ?? '…'}
                      </p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <Calendar className="w-4 h-4 text-gray-500" />
                        <span className="text-xs text-gray-500 font-medium">Membre depuis</span>
                      </div>
                      <p className="text-sm font-semibold text-gray-700">
                        {new Date(panelEmployee.createdAt).toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' })}
                      </p>
                    </div>
                  </div>

                  {/* Edit / Delete buttons */}
                  <div className="border-t pt-4 space-y-2">
                    <Button variant="outline" className="w-full" onClick={() => openEdit(panelEmployee)}>
                      <Pencil className="w-4 h-4 mr-2" /> Modifier les informations
                    </Button>
                    <Button variant="outline" className="w-full text-red-600 border-red-200 hover:bg-red-50"
                      onClick={() => setDeletingEmployee(panelEmployee)}>
                      <Trash2 className="w-4 h-4 mr-2" /> Supprimer l'employé
                    </Button>
                  </div>
                </TabsContent>

                {/* ── Documents tab ──────────────────────────────────────────────── */}
                <TabsContent value="documents" className="flex-1 min-h-0 overflow-y-auto px-6 py-5 space-y-4">
                  {/* Upload form */}
                  <div className="border rounded-lg p-4 bg-gray-50 space-y-3">
                    <h3 className="text-sm font-semibold flex items-center gap-2">
                      <Upload className="w-4 h-4 text-gray-500" /> Ajouter un document
                    </h3>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label htmlFor="doc-type">Type</Label>
                        <Select value={uploadFileType} onValueChange={setUploadFileType}>
                          <SelectTrigger id="doc-type"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {DOC_TYPE_OPTIONS.map((t) => (
                              <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="doc-file">Fichier</Label>
                        <Input
                          id="doc-file"
                          ref={fileInputRef}
                          type="file"
                          accept=".pdf,.jpg,.jpeg,.png"
                          className="cursor-pointer"
                          onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
                        />
                      </div>
                    </div>
                    {uploadFile && (
                      <p className="text-xs text-gray-600 truncate">
                        Fichier sélectionné : <strong>{uploadFile.name}</strong>
                        {' '}({(uploadFile.size / 1024).toFixed(0)} KB)
                      </p>
                    )}
                    {uploadError && (
                      <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1">{uploadError}</p>
                    )}
                    <Button
                      size="sm"
                      disabled={!uploadFile || isUploading}
                      onClick={handleUploadDocument}
                    >
                      {isUploading
                        ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Upload...</>
                        : <><Upload className="w-4 h-4 mr-2" />Envoyer</>}
                    </Button>
                  </div>

                  {/* Documents list */}
                  {docsLoading ? (
                    <div className="space-y-2">
                      {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
                    </div>
                  ) : !documents?.length ? (
                    <div className="text-center py-10 text-gray-400">
                      <FileText className="w-10 h-10 mx-auto mb-2 opacity-30" />
                      <p className="text-sm">Aucun document</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {documents.map((doc) => (
                        <div key={doc.id} className="border rounded-lg p-3 flex items-start gap-3 bg-white">
                          <FileText className="w-5 h-5 text-gray-400 shrink-0 mt-0.5" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{doc.originalName}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <Badge className={`text-xs ${DOC_TYPE_COLORS[doc.fileType] ?? ''}`}>
                                {DOC_TYPE_OPTIONS.find((t) => t.value === doc.fileType)?.label ?? doc.fileType}
                              </Badge>
                              <span className="text-xs text-gray-400">
                                {new Date(doc.uploadedAt).toLocaleDateString('fr-FR')}
                              </span>
                            </div>
                            {doc.uploadedBy && (
                              <p className="text-xs text-gray-400 mt-0.5">par {doc.uploadedBy.email}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <Button variant="ghost" size="sm" title="Télécharger" onClick={() => handleDownload(doc)}>
                              <Download className="w-4 h-4 text-indigo-600" />
                            </Button>
                            <Button
                              variant="ghost" size="sm" title="Supprimer"
                              onClick={() => deleteDocMutation.mutate({ empId: panelEmployee.id, docId: doc.id })}
                              disabled={deleteDocMutation.isPending}
                            >
                              <Trash2 className="w-4 h-4 text-red-500" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>

                {/* ── Pay rates tab ──────────────────────────────────────────── */}
                <TabsContent value="pay-rates" className="flex-1 min-h-0 overflow-y-auto px-6 py-5 space-y-4">
                  <p className="text-xs text-gray-500">
                    Ces tarifs s'appliquent aux nouvelles tournées assignées à cet employé.
                    Les tournées existantes ne sont pas modifiées.
                  </p>

                  {ratesLoading ? (
                    <div className="space-y-2">
                      {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
                    </div>
                  ) : (
                    <>
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-xs text-gray-500 border-b">
                            <th className="text-left py-2 font-medium">Type</th>
                            <th className="text-center py-2 font-medium">Chauffeur (€)</th>
                            <th className="text-center py-2 font-medium">Aide (€)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {(payRates ?? []).map((r) => {
                            const isEditing = !!editingRates[r.tourType];
                            const editVals = editingRates[r.tourType] ?? {
                              chauffeurRate: String(r.chauffeurRate),
                              aideRate: r.aideRate != null ? String(r.aideRate) : '',
                            };

                            return (
                              <tr key={r.tourType} className="group">
                                <td className="py-2 font-medium">{TOUR_TYPE_LABELS[r.tourType]}</td>
                                <td className="py-2 text-center">
                                  {isEditing ? (
                                    <input
                                      type="number"
                                      min="0"
                                      step="1"
                                      value={editVals.chauffeurRate}
                                      onChange={(e) =>
                                        setEditingRates((prev) => ({
                                          ...prev,
                                          [r.tourType]: { ...editVals, chauffeurRate: e.target.value },
                                        }))
                                      }
                                      className="w-20 border rounded px-2 py-1 text-center text-sm"
                                    />
                                  ) : (
                                    <button
                                      onClick={() =>
                                        setEditingRates((prev) => ({
                                          ...prev,
                                          [r.tourType]: {
                                            chauffeurRate: String(r.chauffeurRate),
                                            aideRate: r.aideRate != null ? String(r.aideRate) : '',
                                          },
                                        }))
                                      }
                                      className="flex items-center justify-center gap-1 w-full hover:text-blue-600 group"
                                    >
                                      <span>{r.chauffeurRate}€</span>
                                      {r.isCustomChauffeur ? (
                                        <span className="text-xs text-blue-500">(personnalisé)</span>
                                      ) : (
                                        <span className="text-xs text-gray-400">(défaut)</span>
                                      )}
                                      <Pencil size={11} className="opacity-0 group-hover:opacity-100 text-gray-400" />
                                    </button>
                                  )}
                                </td>
                                <td className="py-2 text-center">
                                  {r.systemAideRate == null ? (
                                    <span className="text-gray-300">—</span>
                                  ) : isEditing ? (
                                    <input
                                      type="number"
                                      min="0"
                                      step="1"
                                      value={editVals.aideRate}
                                      onChange={(e) =>
                                        setEditingRates((prev) => ({
                                          ...prev,
                                          [r.tourType]: { ...editVals, aideRate: e.target.value },
                                        }))
                                      }
                                      className="w-20 border rounded px-2 py-1 text-center text-sm"
                                    />
                                  ) : (
                                    <button
                                      onClick={() =>
                                        setEditingRates((prev) => ({
                                          ...prev,
                                          [r.tourType]: {
                                            chauffeurRate: String(r.chauffeurRate),
                                            aideRate: r.aideRate != null ? String(r.aideRate) : '',
                                          },
                                        }))
                                      }
                                      className="flex items-center justify-center gap-1 w-full hover:text-blue-600 group"
                                    >
                                      <span>
                                        {r.aideRate != null ? `${r.aideRate}€` : `${r.systemAideRate}€`}
                                      </span>
                                      {r.isCustomAide ? (
                                        <span className="text-xs text-blue-500">(personnalisé)</span>
                                      ) : (
                                        <span className="text-xs text-gray-400">(défaut)</span>
                                      )}
                                      <Pencil size={11} className="opacity-0 group-hover:opacity-100 text-gray-400" />
                                    </button>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>

                      {Object.keys(editingRates).length > 0 && (
                        <div className="flex gap-2 pt-2 border-t">
                          <Button
                            size="sm"
                            className="flex-1"
                            disabled={savePayRatesMutation.isPending}
                            onClick={() => {
                              const rates = Object.entries(editingRates).map(([tourType, vals]) => ({
                                tourType,
                                chauffeurRate: parseFloat(vals.chauffeurRate) || 0,
                                aideRate: vals.aideRate !== '' ? parseFloat(vals.aideRate) : null,
                              }));
                              savePayRatesMutation.mutate(rates);
                            }}
                          >
                            {savePayRatesMutation.isPending ? (
                              <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Enregistrement...</>
                            ) : (
                              'Enregistrer les tarifs'
                            )}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setEditingRates({})}
                            disabled={savePayRatesMutation.isPending}
                          >
                            Annuler
                          </Button>
                        </div>
                      )}
                    </>
                  )}
                </TabsContent>
              </Tabs>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
