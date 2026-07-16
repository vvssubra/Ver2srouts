import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";
import { Upload, FileText, Trash2, Download, Loader2 } from "lucide-react";
import { uploadAndSign, extractStoragePath } from "@/lib/storage/signedUrl";

const DOCUMENT_TYPES = [
  { value: "resume", label: "Resume / CV" },
  { value: "offer_letter", label: "Offer Letter" },
  { value: "employee_handbook", label: "Employee Handbook Acknowledgment" },
  { value: "health_history", label: "Health History Form" },
  { value: "teacher_permit", label: "Teacher Permit" },
  { value: "typhoid_cert", label: "Typhoid Injection Certificate" },
  { value: "other", label: "Other" },
];

interface Props {
  staffUserId: string;
  canManage?: boolean;
}

export default function StaffDocumentUpload({ staffUserId, canManage = false }: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [docType, setDocType] = useState("resume");
  const [file, setFile] = useState<File | null>(null);
  const [notes, setNotes] = useState("");

  const { data: documents = [], isLoading } = useQuery({
    queryKey: ["staff-documents", staffUserId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff_documents" as any)
        .select("*")
        .eq("user_id", staffUserId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
    enabled: !!staffUserId,
  });

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!file || !user) throw new Error("No file selected");
      const ext = file.name.split(".").pop();
      const path = `${staffUserId}/${Date.now()}-${docType}.${ext}`;
      const fileUrl = await uploadAndSign("staff-documents", path, file);
      const { error: dbError } = await supabase.from("staff_documents" as any).insert({
        user_id: staffUserId,
        document_type: docType,
        file_url: fileUrl,
        file_name: file.name,
        notes: notes || null,
        uploaded_by: user.id,
      } as any);
      if (dbError) throw dbError;
    },
    onSuccess: () => {
      toast({ title: "Document uploaded successfully" });
      setFile(null);
      setNotes("");
      queryClient.invalidateQueries({ queryKey: ["staff-documents", staffUserId] });
    },
    onError: (e: any) => toast({ title: "Upload failed", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (doc: any) => {
      const parsed = extractStoragePath(doc.file_url);
      if (parsed && parsed.bucket === "staff-documents") {
        await supabase.storage.from("staff-documents").remove([parsed.path]);
      }
      const { error } = await supabase.from("staff_documents" as any).delete().eq("id", doc.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Document deleted" });
      queryClient.invalidateQueries({ queryKey: ["staff-documents", staffUserId] });
    },
    onError: (e: any) => toast({ title: "Delete failed", description: e.message, variant: "destructive" }),
  });

  const canUpload = canManage || user?.id === staffUserId;
  const typeLabel = (val: string) => DOCUMENT_TYPES.find((d) => d.value === val)?.label ?? val;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Documents</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {canUpload && (
          <div className="flex flex-col gap-3 rounded-lg border border-dashed p-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <Label>Document Type</Label>
                <Select value={docType} onValueChange={setDocType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DOCUMENT_TYPES.map((d) => (
                      <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>File</Label>
                <Input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              </div>
              <div>
                <Label>Notes (optional)</Label>
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any notes..." />
              </div>
            </div>
            <Button
              onClick={() => uploadMutation.mutate()}
              disabled={!file || uploadMutation.isPending}
              className="w-fit"
            >
              {uploadMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Upload Document
            </Button>
          </div>
        )}

        {isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : documents.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-6">No documents uploaded yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>File Name</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead>Uploaded</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {documents.map((doc: any) => (
                <TableRow key={doc.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      {typeLabel(doc.document_type)}
                    </div>
                  </TableCell>
                  <TableCell className="max-w-[200px] truncate">{doc.file_name}</TableCell>
                  <TableCell className="max-w-[150px] truncate text-muted-foreground">{doc.notes || "—"}</TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {new Date(doc.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" asChild>
                        <a href={doc.file_url} target="_blank" rel="noreferrer"><Download className="h-4 w-4" /></a>
                      </Button>
                      {canUpload && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => deleteMutation.mutate(doc)}
                          disabled={deleteMutation.isPending}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
