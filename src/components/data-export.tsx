'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Download, FileJson, FileSpreadsheet, Loader2 } from 'lucide-react';

export function DataExport() {
  const [exporting, setExporting] = useState(false);
  const [exportFormat, setExportFormat] = useState<'json' | 'csv' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleExport = async (format: 'json' | 'csv') => {
    try {
      setExporting(true);
      setExportFormat(format);
      setError(null);

      const response = await fetch(`/api/export?format=${format}`);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Export failed');
      }

      // Get the blob from response
      const blob = await response.blob();

      // Create download link
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;

      const dateStr = new Date().toISOString().split('T')[0];
      link.download = format === 'json'
        ? `opennutri-export-${dateStr}.json`
        : `opennutri-export-${dateStr}.csv`;

      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setExporting(false);
      setExportFormat(null);
    }
  };

  return (
    <Dialog>
      <DialogTrigger>
        <Button variant="outline" size="sm">
          <Download className="mr-2 h-4 w-4" />
          Export Data
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Export Your Data</DialogTitle>
          <DialogDescription>
            Download all your food logs, weight records, and nutrition data.
            Your data is yours - we do not sell it.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <FileJson className="h-5 w-5" />
                JSON Format
              </CardTitle>
              <CardDescription>
                Complete data export including all details. Best for backup or importing to other apps.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                onClick={() => handleExport('json')}
                disabled={exporting}
                className="w-full"
              >
                {exporting && exportFormat === 'json' ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Preparing...
                  </>
                ) : (
                  <>
                    <Download className="mr-2 h-4 w-4" />
                    Export as JSON
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5" />
                CSV Format
              </CardTitle>
              <CardDescription>
                Spreadsheet-friendly format. Open in Excel, Google Sheets, or Numbers.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                onClick={() => handleExport('csv')}
                disabled={exporting}
                variant="outline"
                className="w-full"
              >
                {exporting && exportFormat === 'csv' ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Preparing...
                  </>
                ) : (
                  <>
                    <Download className="mr-2 h-4 w-4" />
                    Export as CSV
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          {error && (
            <div className="text-sm text-destructive text-center">
              {error}
            </div>
          )}

          <div className="text-xs text-muted-foreground text-center pt-2">
            <p>
              Export includes: food logs, macronutrients, weight records, and AI scan history.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
