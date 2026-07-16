import { useState, useCallback, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Upload,
  FileSpreadsheet,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ArrowRight,
  Loader2,
  Database,
  Users,
  GraduationCap,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";

// CSV parser handling quoted fields
function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let current = "";
  let inQuotes = false;
  let row: string[] = [];

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        row.push(current.trim());
        current = "";
      } else if (ch === "\n" || (ch === "\r" && text[i + 1] === "\n")) {
        row.push(current.trim());
        if (row.some((c) => c !== "")) rows.push(row);
        row = [];
        current = "";
        if (ch === "\r") i++;
      } else {
        current += ch;
      }
    }
  }
  row.push(current.trim());
  if (row.some((c) => c !== "")) rows.push(row);
  return rows;
}

const STUDENT_FIELDS = [
  { value: "first_name", label: "First Name", required: true },
  { value: "last_name", label: "Last Name", required: true },
  { value: "date_of_birth", label: "Date of Birth", required: false },
  { value: "class_name", label: "Class Name", required: false },
  { value: "parent_email", label: "Parent Email", required: true },
  { value: "parent_phone", label: "Parent Phone", required: false },
  { value: "parent_first_name", label: "Parent First Name", required: false },
  { value: "parent_last_name", label: "Parent Last Name", required: false },
  { value: "__skip", label: "— Skip Column —", required: false },
];

const STAFF_FIELDS = [
  { value: "first_name", label: "First Name", required: true },
  { value: "last_name", label: "Last Name", required: true },
  { value: "email", label: "Email", required: true },
  { value: "phone", label: "Phone", required: false },
  { value: "position", label: "Position", required: false },
  { value: "__skip", label: "— Skip Column —", required: false },
];

type MigrationMode = "students" | "staff";

interface ValidationError {
  row: number;
  col: number;
  message: string;
}

function autoMapColumn(header: string, fields: typeof STUDENT_FIELDS): string {
  const h = header.toLowerCase().replace(/[^a-z0-9]/g, "");
  const mappings: Record<string, string[]> = {
    first_name: ["firstname", "fname", "givenname", "kidsname", "childname", "childsfirstname", "staffname"],
    last_name: ["lastname", "lname", "surname", "familyname"],
    date_of_birth: ["dob", "dateofbirth", "birthday", "birthdate"],
    class_name: ["class", "classname", "classroom", "group"],
    parent_email: ["parentemail", "email", "guardianemail", "motheremail", "fatheremail"],
    parent_phone: ["parentphone", "phone", "contact", "mobile", "tel", "guardianphone"],
    parent_first_name: ["parentfirstname", "parentname", "guardianname", "mothername", "fathername"],
    parent_last_name: ["parentlastname", "guardianlastname"],
    email: ["email", "emailaddress", "workemail"],
    phone: ["phone", "mobile", "contact", "tel"],
    position: ["position", "role", "jobtitle", "title", "designation"],
  };

  for (const field of fields) {
    if (field.value === "__skip") continue;
    const aliases = mappings[field.value] ?? [];
    if (h === field.value.replace(/_/g, "") || aliases.includes(h)) {
      return field.value;
    }
  }
  return "__skip";
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[\d+\-() ]{7,20}$/;

export default function DataMigrationHub() {
  const { user } = useAuth();
  const [mode, setMode] = useState<MigrationMode>("students");
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<string[][]>([]);
  const [columnMapping, setColumnMapping] = useState<Record<number, string>>({});
  const [step, setStep] = useState<"upload" | "map" | "validate" | "importing" | "done">("upload");
  const [selectedBranchId, setSelectedBranchId] = useState<string>("");
  const [importResult, setImportResult] = useState<{ success: number; failed: number } | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const fields = mode === "students" ? STUDENT_FIELDS : STAFF_FIELDS;

  const { data: branches } = useQuery({
    queryKey: ["migration-branches"],
    queryFn: async () => {
      const { data } = await supabase.from("branches").select("id, name").eq("is_active", true).order("name");
      return data ?? [];
    },
  });

  const handleFile = useCallback(
    (file: File) => {
      if (!file.name.endsWith(".csv")) {
        toast({ title: "Invalid file", description: "Please upload a .csv file", variant: "destructive" });
        return;
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        const parsed = parseCSV(text);
        if (parsed.length < 2) {
          toast({ title: "Empty file", description: "CSV must have a header row and data rows", variant: "destructive" });
          return;
        }
        const headers = parsed[0];
        const rows = parsed.slice(1);
        setCsvHeaders(headers);
        setCsvRows(rows);
        // Auto-map columns
        const mapping: Record<number, string> = {};
        headers.forEach((h, i) => {
          mapping[i] = autoMapColumn(h, fields);
        });
        setColumnMapping(mapping);
        setStep("map");
      };
      reader.readAsText(file);
    },
    [fields]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  // Validate rows
  const validationErrors = useMemo(() => {
    if (step !== "validate" && step !== "map") return [];
    const errors: ValidationError[] = [];
    const requiredFields = fields.filter((f) => f.required).map((f) => f.value);
    const mappedFields = Object.entries(columnMapping);

    csvRows.forEach((row, ri) => {
      mappedFields.forEach(([colIdx, fieldName]) => {
        if (fieldName === "__skip") return;
        const value = row[parseInt(colIdx)] ?? "";
        const field = fields.find((f) => f.value === fieldName);

        if (field?.required && !value.trim()) {
          errors.push({ row: ri, col: parseInt(colIdx), message: `${field.label} is required` });
        }

        if (fieldName === "email" || fieldName === "parent_email") {
          if (value.trim() && !EMAIL_RE.test(value.trim())) {
            errors.push({ row: ri, col: parseInt(colIdx), message: "Invalid email format" });
          }
        }

        if (fieldName === "phone" || fieldName === "parent_phone") {
          if (value.trim() && !PHONE_RE.test(value.trim())) {
            errors.push({ row: ri, col: parseInt(colIdx), message: "Invalid phone format" });
          }
        }
      });
    });

    return errors;
  }, [csvRows, columnMapping, step, fields]);

  const errorsByCell = useMemo(() => {
    const map = new Map<string, string>();
    validationErrors.forEach((e) => map.set(`${e.row}-${e.col}`, e.message));
    return map;
  }, [validationErrors]);

  const criticalErrorCount = validationErrors.filter((e) => {
    const field = fields.find((f) => f.value === columnMapping[e.col]);
    return field?.required;
  }).length;

  const getMappedRow = (row: string[]): Record<string, string> => {
    const obj: Record<string, string> = {};
    Object.entries(columnMapping).forEach(([colIdx, fieldName]) => {
      if (fieldName !== "__skip") {
        obj[fieldName] = row[parseInt(colIdx)]?.trim() ?? "";
      }
    });
    return obj;
  };

  const handleImport = async () => {
    if (!selectedBranchId) {
      toast({ title: "Select a branch", description: "Choose a target branch first", variant: "destructive" });
      return;
    }
    setStep("importing");
    let success = 0;
    let failed = 0;

    if (mode === "students") {
      for (const row of csvRows) {
        try {
          const mapped = getMappedRow(row);
          if (!mapped.first_name || !mapped.last_name) { failed++; continue; }

          const { error } = await supabase.from("students").insert({
            first_name: mapped.first_name,
            last_name: mapped.last_name,
            date_of_birth: mapped.date_of_birth || null,
            class_name: mapped.class_name || null,
            branch_id: selectedBranchId,
            parent_email: mapped.parent_email || null,
            parent_phone: mapped.parent_phone || null,
          } as any);
          if (error) { failed++; } else { success++; }
        } catch {
          failed++;
        }
      }
    } else {
      for (const row of csvRows) {
        try {
          const mapped = getMappedRow(row);
          if (!mapped.first_name || !mapped.last_name || !mapped.email) { failed++; continue; }

          // Insert into profiles (staff records)
          const { error } = await supabase.from("profiles").insert({
            id: crypto.randomUUID(),
            first_name: mapped.first_name,
            last_name: mapped.last_name,
            email: mapped.email,
            phone: mapped.phone || null,
            position: mapped.position || null,
          } as any);
          if (error) { failed++; } else { success++; }
        } catch {
          failed++;
        }
      }
    }

    setImportResult({ success, failed });
    setStep("done");
    toast({
      title: "Import complete",
      description: `${success} records imported, ${failed} failed`,
      variant: failed > 0 ? "destructive" : "default",
    });
  };

  const resetAll = () => {
    setCsvHeaders([]);
    setCsvRows([]);
    setColumnMapping({});
    setStep("upload");
    setImportResult(null);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Database className="h-6 w-6 text-primary" />
            Data Migration Hub
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Bulk import student and staff records from CSV files
          </p>
        </div>

        {/* Mode + Branch Selection */}
        <div className="flex flex-wrap gap-4">
          <Tabs value={mode} onValueChange={(v) => { setMode(v as MigrationMode); resetAll(); }}>
            <TabsList>
              <TabsTrigger value="students" className="gap-1.5">
                <GraduationCap className="h-4 w-4" /> Student Records
              </TabsTrigger>
              <TabsTrigger value="staff" className="gap-1.5">
                <Users className="h-4 w-4" /> Staff Records
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <Select value={selectedBranchId} onValueChange={setSelectedBranchId}>
            <SelectTrigger className="w-[240px]">
              <SelectValue placeholder="Select target branch" />
            </SelectTrigger>
            <SelectContent>
              {branches?.map((b: any) => (
                <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Step: Upload */}
        {step === "upload" && (
          <Card>
            <CardContent className="p-8">
              <div
                onDrop={handleDrop}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                className={`border-2 border-dashed rounded-xl p-12 text-center transition-colors cursor-pointer ${
                  dragOver ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50"
                }`}
                onClick={() => document.getElementById("csv-input")?.click()}
              >
                <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
                <h3 className="text-lg font-semibold text-foreground mb-1">
                  Drop your CSV file here
                </h3>
                <p className="text-sm text-muted-foreground mb-4">
                  or click to browse — supports {mode === "students" ? "student" : "staff"} records
                </p>
                <Badge variant="outline" className="text-xs">
                  <FileSpreadsheet className="h-3 w-3 mr-1" /> .csv files only
                </Badge>
                <input
                  id="csv-input"
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={handleFileInput}
                />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step: Column Mapping */}
        {step === "map" && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <ArrowRight className="h-4 w-4 text-primary" />
                Map CSV Columns to Database Fields
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                {csvRows.length} rows detected · Map each CSV column to the correct field
              </p>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {csvHeaders.map((header, idx) => (
                  <div key={idx} className="flex items-center gap-4">
                    <div className="w-[200px] text-sm font-medium truncate bg-muted px-3 py-2 rounded-md">
                      {header}
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                    <Select
                      value={columnMapping[idx] ?? "__skip"}
                      onValueChange={(v) => setColumnMapping((p) => ({ ...p, [idx]: v }))}
                    >
                      <SelectTrigger className="w-[220px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {fields.map((f) => (
                          <SelectItem key={f.value} value={f.value}>
                            {f.label} {f.required && "•"}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {fields.find((f) => f.value === columnMapping[idx])?.required && (
                      <Badge variant="default" className="text-[10px] shrink-0">Required</Badge>
                    )}
                  </div>
                ))}
              </div>
              <div className="flex justify-between mt-6">
                <Button variant="outline" onClick={resetAll}>Back</Button>
                <Button onClick={() => setStep("validate")}>
                  Validate Data <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step: Validation Preview */}
        {step === "validate" && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle className="text-base flex items-center gap-2">
                  Data Validation Preview
                </CardTitle>
                <div className="flex gap-2">
                  {criticalErrorCount > 0 ? (
                    <Badge variant="destructive" className="gap-1">
                      <XCircle className="h-3 w-3" /> {criticalErrorCount} critical errors
                    </Badge>
                  ) : (
                    <Badge variant="default" className="gap-1 bg-green-600">
                      <CheckCircle2 className="h-3 w-3" /> All records valid
                    </Badge>
                  )}
                  {validationErrors.length > 0 && validationErrors.length !== criticalErrorCount && (
                    <Badge variant="secondary" className="gap-1">
                      <AlertTriangle className="h-3 w-3" /> {validationErrors.length - criticalErrorCount} warnings
                    </Badge>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <ScrollArea className="max-h-[500px] border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12 text-xs">#</TableHead>
                      {csvHeaders.map((h, i) => (
                        <TableHead key={i} className="text-xs min-w-[120px]">
                          <div>{h}</div>
                          <div className="text-[10px] text-muted-foreground font-normal">
                            → {fields.find((f) => f.value === columnMapping[i])?.label ?? "Skip"}
                          </div>
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {csvRows.slice(0, 100).map((row, ri) => (
                      <TableRow key={ri}>
                        <TableCell className="text-xs text-muted-foreground">{ri + 1}</TableCell>
                        {row.map((cell, ci) => {
                          const err = errorsByCell.get(`${ri}-${ci}`);
                          return (
                            <TableCell
                              key={ci}
                              className={`text-xs ${err ? "bg-destructive/10 text-destructive" : ""}`}
                              title={err ?? undefined}
                            >
                              <div className="flex items-center gap-1">
                                {err && <AlertTriangle className="h-3 w-3 shrink-0" />}
                                <span className="truncate max-w-[150px]">{cell || "—"}</span>
                              </div>
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
              {csvRows.length > 100 && (
                <p className="text-xs text-muted-foreground mt-2 text-center">
                  Showing first 100 of {csvRows.length} rows
                </p>
              )}
              <div className="flex justify-between mt-6">
                <Button variant="outline" onClick={() => setStep("map")}>Back to Mapping</Button>
                <Button
                  onClick={handleImport}
                  disabled={criticalErrorCount > 0 || !selectedBranchId}
                >
                  {!selectedBranchId ? "Select a branch first" : criticalErrorCount > 0 ? "Fix errors first" : `Import ${csvRows.length} Records`}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step: Importing */}
        {step === "importing" && (
          <Card>
            <CardContent className="py-16 text-center">
              <Loader2 className="h-12 w-12 animate-spin mx-auto mb-4 text-primary" />
              <h3 className="text-lg font-semibold">Importing Records...</h3>
              <p className="text-sm text-muted-foreground mt-1">Please wait while we process your data</p>
            </CardContent>
          </Card>
        )}

        {/* Step: Done */}
        {step === "done" && importResult && (
          <Card>
            <CardContent className="py-12 text-center">
              {importResult.failed === 0 ? (
                <CheckCircle2 className="h-16 w-16 mx-auto mb-4 text-green-500" />
              ) : (
                <AlertTriangle className="h-16 w-16 mx-auto mb-4 text-amber-500" />
              )}
              <h3 className="text-xl font-bold">Import Complete</h3>
              <div className="flex justify-center gap-6 mt-4">
                <div className="text-center">
                  <p className="text-3xl font-bold text-green-600">{importResult.success}</p>
                  <p className="text-xs text-muted-foreground">Successful</p>
                </div>
                {importResult.failed > 0 && (
                  <div className="text-center">
                    <p className="text-3xl font-bold text-destructive">{importResult.failed}</p>
                    <p className="text-xs text-muted-foreground">Failed</p>
                  </div>
                )}
              </div>
              <Button className="mt-6" onClick={resetAll}>Import Another File</Button>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
