import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle, Clock, XCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

// Types
interface ImportBatch {
  id: string;
  fileName: string;
  uploadedAt: string;
  status: 'pending' | 'processing' | 'preview' | 'committed' | 'cancelled' | 'failed';
  rowCount: number;
  errorCount: number;
}

interface ImportRow {
  id: string;
  rowIndex: number;
  sheetName: string;
  parsedData: Record<string, any> | null;
  status: 'parsed' | 'skipped' | 'error';
  errorMessage?: string;
}

const statusConfig = {
  pending: { label: 'Pending', icon: Clock, className: 'bg-blue-100 text-blue-800' },
  processing: { label: 'Processing', icon: Clock, className: 'bg-yellow-100 text-yellow-800' },
  preview: { label: 'Ready to Commit', icon: CheckCircle, className: 'bg-green-100 text-green-800' },
  committed: { label: 'Committed', icon: CheckCircle, className: 'bg-emerald-100 text-emerald-800' },
  cancelled: { label: 'Cancelled', icon: XCircle, className: 'bg-slate-100 text-slate-800' },
  failed: { label: 'Failed', icon: AlertCircle, className: 'bg-red-100 text-red-800' },
};

export default function Import() {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);

  // Fetch import history
  const { data: historyData } = useQuery<ImportBatch[]>({
    queryKey: ['imports'],
    queryFn: async () => {
      const res = await api.get<ImportBatch[]>('/imports?limit=10');
      return Array.isArray(res.data) ? res.data : [];
    },
  });

  // Fetch import status and rows (when viewing an import)
  const { data: importData, isLoading: isLoadingImport } = useQuery({
    queryKey: ['import', id],
    queryFn: async () => {
      if (!id) return null;
      const [statusRes, rowsRes] = await Promise.all([
        api.get<ImportBatch>(`/imports/${id}/status`),
        api.get<{ rows: ImportRow[]; total: number }>(`/imports/${id}/rows?limit=200`),
      ]);
      return {
        batch: statusRes.data,
        rows: rowsRes.data.rows ?? [],
      };
    },
    enabled: !!id,
    refetchInterval: (query) => {
      const status = query.state.data?.batch?.status;
      return status === 'processing' || status === 'pending' ? 3000 : false;
    },
  });

  // Upload mutation
  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);

      const response = await api.post<ImportBatch>('/imports/upload', formData, {
        headers: { 'Content-Type': undefined },
        onUploadProgress: (progressEvent) => {
          const percentCompleted = progressEvent.total
            ? Math.round((progressEvent.loaded * 100) / progressEvent.total)
            : 0;
          setUploadProgress(percentCompleted);
        },
      });

      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['imports'] });
      queryClient.setQueryData(['import', data.id], { batch: data, rows: [] });
      navigate(`/import/${data.id}`);
      setSelectedFile(null);
      setUploadProgress(0);
    },
  });

  // Commit mutation
  const commitMutation = useMutation({
    mutationFn: async (importId: string) => {
      await api.post(`/imports/${importId}/commit`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['imports'] });
      queryClient.invalidateQueries({ queryKey: ['tours'] });
      setConfirmDialogOpen(false);
      navigate('/tours');
    },
    onError: (err: any) => {
      setConfirmDialogOpen(false);
      alert(err?.response?.data?.message || 'Commit failed. Please try again.');
    },
  });

  // Cancel mutation
  const cancelMutation = useMutation({
    mutationFn: async (importId: string) => {
      await api.post(`/imports/${importId}/cancel`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['imports'] });
      navigate('/import');
    },
    onError: (err: any) => {
      alert(err?.response?.data?.message || 'Cancel failed. Please try again.');
    },
  });

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const file = e.dataTransfer.files[0];
    if (file && (file.name.endsWith('.xlsx') || file.name.endsWith('.xls'))) {
      setSelectedFile(file);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  const handleUpload = () => {
    if (selectedFile) {
      uploadMutation.mutate(selectedFile);
    }
  };

  const handleCommit = () => {
    if (id) {
      commitMutation.mutate(id);
    }
  };

  const handleCancel = () => {
    if (id) {
      cancelMutation.mutate(id);
    }
  };

  const allRows: ImportRow[] = importData?.rows ?? [];
  const parsedRows = allRows.filter(row => row.status === 'parsed');
  const errorRows = allRows.filter(row => row.status === 'error');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Import Boulanger Excel</h1>
      </div>

      {/* Upload Zone (show when not viewing a specific import) */}
      {!id && (
        <div className="bg-white p-6 rounded-lg border space-y-4">
          <h2 className="text-lg font-semibold">Upload New File</h2>
          
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`
              border-2 border-dashed rounded-lg p-6 md:p-12 text-center transition-colors
              ${isDragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300'}
              ${selectedFile ? 'bg-green-50 border-green-500' : ''}
            `}
          >
            {selectedFile ? (
              <div className="space-y-3">
                <FileSpreadsheet className="h-12 w-12 text-green-600 mx-auto" />
                <div>
                  <p className="font-medium text-green-900">{selectedFile.name}</p>
                  <p className="text-sm text-green-700">
                    {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                </div>
<div className="flex gap-2 justify-center">
                  <Button onClick={handleUpload} disabled={uploadMutation.isPending}>
                    {uploadMutation.isPending ? `Uploading ${uploadProgress}%` : 'Upload'}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setSelectedFile(null)}
                    disabled={uploadMutation.isPending}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <Upload className="h-12 w-12 text-gray-400 mx-auto" />
                <div>
                  <p className="text-gray-700 font-medium">
                    Drag and drop your Excel file here
                  </p>
                  <p className="text-sm text-gray-500 mt-1">
                    or click to browse (.xlsx files only)
                  </p>
                </div>
                <div>
                  <input
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={handleFileSelect}
                    className="hidden"
                    id="file-input"
                  />
                  <label htmlFor="file-input">
                    <Button variant="outline" onClick={() => document.getElementById('file-input')?.click()}>
                      Browse Files
                    </Button>
                  </label>
                </div>
              </div>
            )}
          </div>
          
          {uploadMutation.isError && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />
              <div>
                <p className="font-medium text-red-900">Upload failed</p>
                <p className="text-sm text-red-700">
                  Please try again or contact support if the issue persists.
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Import Preview (show when viewing a specific import) */}
      {id && (
        <div className="bg-white rounded-lg border">
          {isLoadingImport ? (
            <div className="p-8 space-y-3">
              <Skeleton className="h-8 w-64" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : importData ? (
            <div className="p-6 space-y-6">
              {/* Batch Info */}
              <div className="flex items-start justify-between">
                <div className="space-y-2">
                  <h2 className="text-xl font-semibold">{importData.batch.fileName}</h2>
                  <div className="flex items-center gap-4 text-sm text-gray-600">
                    <span>
                      Uploaded {new Date(importData.batch.uploadedAt).toLocaleString('fr-FR')}
                    </span>
                    <span>•</span>
                    <span>{importData.batch.rowCount} rows</span>
                    {importData.batch.errorCount > 0 && (
                      <>
                        <span>•</span>
                        <span className="text-red-600">
                          {importData.batch.errorCount} errors
                        </span>
                      </>
                    )}
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  <Badge className={statusConfig[importData.batch.status]?.className ?? 'bg-gray-100 text-gray-800'}>
                    {statusConfig[importData.batch.status] && React.createElement(statusConfig[importData.batch.status].icon, {
                       className: 'h-3 w-3 mr-1 inline',
                  })}
                 {statusConfig[importData.batch.status]?.label ?? importData.batch.status}
                  </Badge>
                </div>
              </div>

              {/* Action Buttons */}
              {importData.batch.status === 'preview' && (
                <div className="flex gap-2">
                  <Button
                    onClick={() => setConfirmDialogOpen(true)}
                    disabled={commitMutation.isPending}
                  >
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Confirm Import
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleCancel}
                    disabled={cancelMutation.isPending}
                  >
                    <XCircle className="h-4 w-4 mr-2" />
                    Cancel
                  </Button>
                </div>
              )}

              {/* Rows Table with Tabs */}
              <Tabs defaultValue="all">
                <div className="overflow-x-auto">
                <TabsList className="w-full md:w-auto">
                  <TabsTrigger value="all" className="flex-1 md:flex-none">
                    Tous ({allRows.length})
                  </TabsTrigger>
                  <TabsTrigger value="parsed" className="flex-1 md:flex-none">
                    Analysés ({parsedRows.length})
                  </TabsTrigger>
                  <TabsTrigger value="errors" className="flex-1 md:flex-none">
                    Erreurs ({errorRows.length})
                  </TabsTrigger>
                </TabsList>
                </div>

                <TabsContent value="all" className="mt-4">
                  <RowsTable rows={allRows} />
                </TabsContent>

                <TabsContent value="parsed" className="mt-4">
                  <RowsTable rows={parsedRows} />
                </TabsContent>

                <TabsContent value="errors" className="mt-4">
                  <RowsTable rows={errorRows} />
                </TabsContent>
              </Tabs>
            </div>
          ) : null}
        </div>
      )}

      {/* Import History */}
      {!id && (
        <div className="bg-white rounded-lg border">
          <div className="p-6">
            <h2 className="text-lg font-semibold mb-4">Recent Imports</h2>
            
            {historyData && historyData.length > 0 ? (
              <div className="space-y-2">
                {historyData.map((batch) => (
                  <button
                    key={batch.id}
                    onClick={() => navigate(`/import/${batch.id}`)}
                    className="w-full p-4 border rounded-lg hover:bg-gray-50 transition-colors text-left"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <FileSpreadsheet className="h-5 w-5 text-gray-500" />
                        <div>
                          <p className="font-medium">{batch.fileName}</p>
                          <p className="text-sm text-gray-600">
                            {new Date(batch.uploadedAt).toLocaleString('fr-FR')} • {batch.rowCount} rows
                          </p>
                        </div>
                      </div>
                      <Badge className={statusConfig[batch.status]?.className ?? 'bg-gray-100 text-gray-800'}>
                        {statusConfig[batch.status]?.label ?? batch.status}
                      </Badge>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-center py-8">No imports yet</p>
            )}
          </div>
        </div>
      )}

      {/* Confirm Dialog */}
      <Dialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Import</DialogTitle>
            <DialogDescription>
              This will commit {((importData?.batch.rowCount ?? 0) - (importData?.batch.errorCount ?? 0))} tours to the system.
              {importData && importData.batch.errorCount > 0 && (
                <span className="block mt-2 text-red-600">
                  {importData.batch.errorCount} rows with errors will be skipped.
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button onClick={handleCommit} disabled={commitMutation.isPending}>
              {commitMutation.isPending ? 'Committing...' : 'Confirm'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Rows Table Component
function RowsTable({ rows }: { rows: ImportRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        No rows to display
      </div>
    );
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-gray-700">Row #</th>
              <th className="px-4 py-3 text-left font-medium text-gray-700">Sheet</th>
              <th className="px-4 py-3 text-left font-medium text-gray-700">Tour Code</th>
              <th className="px-4 py-3 text-left font-medium text-gray-700">Date</th>
              <th className="px-4 py-3 text-left font-medium text-gray-700">Platform</th>
              <th className="px-4 py-3 text-left font-medium text-gray-700">Transporteur</th>
              <th className="px-4 py-3 text-left font-medium text-gray-700">Status</th>
              <th className="px-4 py-3 text-left font-medium text-gray-700">Error</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index} className="border-t hover:bg-gray-50">
                <td className="px-4 py-3">{row.rowIndex}</td>
                <td className="px-4 py-3">{row.sheetName}</td>
                <td className="px-4 py-3 font-medium">{row.parsedData?.tourCode ?? '-'}</td>
                <td className="px-4 py-3">{row.parsedData?.date ?? '-'}</td>
                <td className="px-4 py-3">{row.parsedData?.platform ?? '-'}</td>
                <td className="px-4 py-3">{row.parsedData?.prestataire ?? '-'}</td>
                <td className="px-4 py-3">
                  <Badge
                    className={
                      row.status === 'parsed'
                        ? 'bg-green-100 text-green-800'
                        : 'bg-red-100 text-red-800'
                    }
                  >
                    {row.status}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-red-600 text-xs">
                  {row.errorMessage || '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
