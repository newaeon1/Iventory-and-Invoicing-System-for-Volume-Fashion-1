import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useParams } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";
import { useAuth } from "@/hooks/useAuth";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useState, useEffect } from "react";
import { type Invoice, type InvoiceItem, type Product } from "@shared/schema";

// Discount form schema
const discountSchema = z.object({
  discountPercentage: z.number().min(0, "Discount cannot be negative").max(100, "Discount cannot exceed 100%")
});

type DiscountForm = z.infer<typeof discountSchema>;

export default function InvoiceDetail() {
  const { toast } = useToast();
  const { user } = useAuth();
  const { id } = useParams();
  const [isEditingDiscount, setIsEditingDiscount] = useState(false);

  const { data: invoice, isLoading, error } = useQuery<Invoice & { items: (InvoiceItem & { product: Product })[] }>({
    queryKey: [`/api/invoices/${id}`],
    enabled: !!id,
  });

  const discountForm = useForm<DiscountForm>({
    resolver: zodResolver(discountSchema),
    defaultValues: {
      discountPercentage: 0
    }
  });

  // Reset form when invoice data changes - using useEffect to prevent re-render loops
  useEffect(() => {
    if (invoice && !discountForm.formState.isDirty) {
      const currentDiscountPercentage = parseFloat(invoice.discountPercentage || "0");
      discountForm.reset({
        discountPercentage: currentDiscountPercentage
      });
    }
  }, [invoice?.discountPercentage, discountForm.formState.isDirty]);

  const updateStatusMutation = useMutation({
    mutationFn: async (status: string) => {
      const response = await apiRequest("PUT", `/api/invoices/${id}/status`, { status });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Invoice status updated successfully",
      });
      queryClient.invalidateQueries({ queryKey: [`/api/invoices/${id}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/metrics"] });
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/";
        }, 500);
        return;
      }
      toast({
        title: "Error",
        description: "Failed to update invoice status",
        variant: "destructive",
      });
    },
  });

  const updateDiscountMutation = useMutation({
    mutationFn: async (discountPercentage: number) => {
      const requestBody = { discountPercentage };
      const response = await apiRequest("PUT", `/api/invoices/${id}/discount`, requestBody);
      
      if (!response.ok) {
        const errorText = await response.text();
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { message: errorText || `HTTP ${response.status}` };
        }
        throw { response: errorData, status: response.status };
      }
      
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Discount updated successfully",
      });
      setIsEditingDiscount(false);
      queryClient.invalidateQueries({ queryKey: [`/api/invoices/${id}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/metrics"] });
    },
    onError: (error: any) => {
      
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized", 
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/";
        }, 500);
        return;
      }
      
      // Try to extract specific error message from API response
      let errorMessage = "Failed to update discount";
      try {
        if (error.response) {
          const responseData = error.response;
          if (responseData.message) {
            errorMessage = responseData.message;
          } else if (responseData.errors && responseData.errors.length > 0) {
            errorMessage = responseData.errors[0].message || errorMessage;
          }
        } else if (error.message) {
          errorMessage = error.message;
        }
      } catch (parseError) {
      }
      
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    },
  });

  const onSubmitDiscount = (data: DiscountForm) => {
    const numericDiscountPercentage = Number(data.discountPercentage);
    
    if (isNaN(numericDiscountPercentage)) {
      toast({
        title: "Error",
        description: "Please enter a valid discount percentage",
        variant: "destructive",
      });
      return;
    }
    
    if (numericDiscountPercentage < 0 || numericDiscountPercentage > 100) {
      toast({
        title: "Error",
        description: "Discount percentage must be between 0 and 100",
        variant: "destructive",
      });
      return;
    }
    
    updateDiscountMutation.mutate(numericDiscountPercentage);
  };

  const cancelDiscountEdit = () => {
    setIsEditingDiscount(false);
    if (invoice) {
      discountForm.reset({
        discountPercentage: parseFloat(invoice.discountPercentage || "0")
      });
    }
  };

  const downloadPDF = async (invoiceId: string, invoiceNumber: string) => {
    try {
      const response = await apiRequest("POST", `/api/invoices/${invoiceId}/pdf`);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `invoice-${invoiceNumber}.pdf`;
      a.click();
      window.URL.revokeObjectURL(url);
      
      toast({
        title: "Success",
        description: "PDF saved successfully",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to download PDF",
        variant: "destructive",
      });
    }
  };

  const handlePrint = () => {
    // Hide action buttons and other non-printable elements
    const actionButtons = document.querySelectorAll('[data-print-hide]');
    actionButtons.forEach(el => (el as HTMLElement).style.display = 'none');
    
    // Print the page
    window.print();
    
    // Restore hidden elements after print
    setTimeout(() => {
      actionButtons.forEach(el => (el as HTMLElement).style.display = '');
    }, 100);
  };

  const formatDate = (date: string | Date) => {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatCurrency = (amount: string | number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(typeof amount === 'string' ? parseFloat(amount) : amount);
  };

  const cancelInvoiceMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("PUT", `/api/invoices/${id}/cancel`);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Invoice cancelled successfully",
      });
      queryClient.invalidateQueries({ queryKey: [`/api/invoices/${id}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/metrics"] });
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/";
        }, 500);
        return;
      }
      toast({
        title: "Error",
        description: "Failed to cancel invoice",
        variant: "destructive",
      });
    },
  });

  const getStatusBadge = (status: string) => {
    if (status === 'Processed') {
      return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Processed</Badge>;
    }
    if (status === 'Cancelled') {
      return <Badge className="bg-red-100 text-red-800 hover:bg-red-100">Cancelled</Badge>;
    }
    return <Badge variant="secondary">Pending</Badge>;
  };

  const canProcessInvoice = () => {
    return ['Admin', 'Manager'].includes(user?.role || '');
  };

  if (isLoading) {
    return (
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-10 w-32" />
        </div>
        <Card>
          <CardContent className="p-6 space-y-4">
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-3/4" />
            <Skeleton className="h-6 w-1/2" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error || !invoice) {
    return (
      <div className="max-w-6xl mx-auto p-6">
        <Card>
          <CardContent className="p-6 text-center">
            <div className="text-center py-8">
              <i className="fas fa-exclamation-circle text-destructive text-4xl mb-4"></i>
              <p className="text-sm text-muted-foreground mb-4">
                {error ? "Failed to load invoice" : "Invoice not found"}
              </p>
              <Link href="/invoices">
                <Button variant="outline">
                  <i className="fas fa-arrow-left w-4 h-4 mr-2"></i>
                  Back to Invoices
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-0">
      {/* Action Buttons Bar */}
      <div className="flex items-center justify-between mb-4" data-print-hide>
        <Link href="/invoices">
          <Button variant="ghost" size="sm">
            <i className="fas fa-arrow-left w-4 h-4 mr-2"></i>
            Back to Invoices
          </Button>
        </Link>
        <div className="flex items-center space-x-2">
          <Button variant="outline" size="sm" onClick={handlePrint} data-testid="button-print">
            <i className="fas fa-print w-4 h-4 mr-2"></i> Print
          </Button>
          <Button variant="outline" size="sm" onClick={() => downloadPDF(invoice.id, invoice.invoiceNumber)} data-testid="button-save-pdf">
            <i className="fas fa-file-pdf w-4 h-4 mr-2"></i> Save as PDF
          </Button>
          {invoice.status === 'Pending' && canProcessInvoice() && (
            <>
              <Button onClick={() => updateStatusMutation.mutate('Processed')} disabled={updateStatusMutation.isPending}
                className="bg-blue-600 hover:bg-blue-700 text-white" size="sm" data-testid="button-process-invoice">
                <i className="fas fa-check w-4 h-4 mr-2"></i>
                {updateStatusMutation.isPending ? "Processing..." : "Mark as Processed"}
              </Button>
              <Button variant="destructive" size="sm" data-testid="button-cancel-invoice"
                disabled={cancelInvoiceMutation.isPending}
                onClick={() => { if (confirm('Are you sure you want to cancel this invoice? This action cannot be undone.')) cancelInvoiceMutation.mutate(); }}>
                <i className="fas fa-ban w-4 h-4 mr-2"></i>
                {cancelInvoiceMutation.isPending ? "Cancelling..." : "Cancel Invoice"}
              </Button>
            </>
          )}
          {invoice.status === 'Processed' && canProcessInvoice() && (
            <Button variant="destructive" size="sm" data-testid="button-cancel-invoice"
              disabled={cancelInvoiceMutation.isPending}
              onClick={() => { if (confirm('Are you sure you want to cancel this processed invoice? Stock will be restored.')) cancelInvoiceMutation.mutate(); }}>
              <i className="fas fa-ban w-4 h-4 mr-2"></i>
              {cancelInvoiceMutation.isPending ? "Cancelling..." : "Cancel Invoice"}
            </Button>
          )}
        </div>
      </div>

      {/* Invoice Document */}
      <div className="bg-white dark:bg-card border border-border rounded-lg shadow-lg overflow-hidden">
        {/* Top accent bar */}
        <div className="h-1.5 bg-rose-500" />

        <div className="p-8 md:p-10">
          {/* Company Header */}
          <div className="flex justify-between items-start mb-6">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">
                VOLUME FASHION
                <span className="text-rose-500 ml-1 text-sm font-semibold tracking-widest">COLLECTION</span>
              </h1>
            </div>
            <div className="text-right text-xs text-muted-foreground leading-relaxed">
              <p>4006-4008 Room, 5th Floor, Changjiang International</p>
              <p>Garment Building, No.931 Renmingbei Road</p>
              <p>Yuexiu District, Guangzhou, China</p>
              <p className="mt-1 font-medium text-foreground">+86 132 8868 9165</p>
            </div>
          </div>

          {/* Separator */}
          <div className="border-t border-border mb-6" />

          {/* Invoice Title + Meta */}
          <div className="flex justify-between items-start mb-8">
            <div>
              <h2 className="text-3xl font-bold tracking-tight text-foreground">INVOICE</h2>
            </div>
            <div className="bg-muted/50 rounded-lg px-5 py-3 text-sm space-y-1.5">
              <div className="flex gap-6">
                <span className="text-muted-foreground font-medium text-xs uppercase tracking-wide">Invoice No.</span>
                <span className="font-bold text-foreground">{invoice.invoiceNumber}</span>
              </div>
              <div className="flex gap-6">
                <span className="text-muted-foreground font-medium text-xs uppercase tracking-wide">Date</span>
                <span className="font-medium text-foreground">{invoice.createdAt ? formatDate(invoice.createdAt) : 'Unknown'}</span>
              </div>
              <div className="flex gap-6">
                <span className="text-muted-foreground font-medium text-xs uppercase tracking-wide">Currency</span>
                <span className="font-medium text-foreground">{invoice.currency || 'USD'}</span>
              </div>
              <div className="flex gap-6 items-center">
                <span className="text-muted-foreground font-medium text-xs uppercase tracking-wide">Status</span>
                {getStatusBadge(invoice.status || 'Unknown')}
              </div>
            </div>
          </div>

          {/* Bill To */}
          <div className="mb-8">
            <p className="text-xs font-semibold uppercase tracking-widest text-rose-500 mb-2">Bill To</p>
            <p className="font-bold text-foreground text-base">{invoice.customerName}</p>
            <div className="text-sm text-muted-foreground mt-1 space-y-0.5">
              {invoice.customerPhone && <p>{invoice.customerPhone}</p>}
              {invoice.customerEmail && <p>{invoice.customerEmail}</p>}
              {invoice.customerAddress && <p>{invoice.customerAddress}</p>}
            </div>
          </div>

          {/* Items Table */}
          <div className="overflow-x-auto mb-8">
            <table className="w-full min-w-[750px]">
              <thead>
                <tr className="bg-slate-900 dark:bg-slate-800 text-white">
                  <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider w-10">#</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider">Product</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider">Color</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider">Size</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider">Category</th>
                  <th className="px-3 py-2.5 text-center text-xs font-semibold uppercase tracking-wider">Qty</th>
                  <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wider">Unit Price</th>
                  <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wider">Total</th>
                </tr>
              </thead>
              <tbody>
                {invoice.items?.map((item: any, index: number) => (
                  <tr key={index} data-testid={`invoice-item-${index}`}
                    className={`border-b border-border ${index % 2 === 0 ? 'bg-muted/30' : ''}`}>
                    <td className="px-3 py-3 text-xs text-muted-foreground">{index + 1}</td>
                    <td className="px-3 py-3">
                      <p className="text-sm font-semibold text-foreground">{item.product?.productName || 'Unknown Product'}</p>
                      <p className="text-xs text-muted-foreground">{item.product?.productId}</p>
                    </td>
                    <td className="px-3 py-3 text-sm text-foreground">{item.product?.color || '-'}</td>
                    <td className="px-3 py-3 text-sm text-foreground">{item.product?.size || '-'}</td>
                    <td className="px-3 py-3">
                      {item.product?.category ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary">
                          {item.product.category}
                        </span>
                      ) : '-'}
                    </td>
                    <td className="px-3 py-3 text-sm text-foreground text-center font-medium">{item.quantity}</td>
                    <td className="px-3 py-3 text-sm text-foreground text-right">{formatCurrency(item.unitPrice)}</td>
                    <td className="px-3 py-3 text-sm font-bold text-foreground text-right">{formatCurrency(item.totalPrice)}</td>
                  </tr>
                )) || (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">No items found</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Totals Section */}
          <div className="flex justify-end mb-8">
            <div className="w-full max-w-sm">
              {invoice.status === 'Pending' && !isEditingDiscount && (
                <div className="flex justify-end mb-2" data-print-hide>
                  <Button variant="outline" size="sm" onClick={() => setIsEditingDiscount(true)} data-testid="button-edit-discount">
                    <i className="fas fa-edit w-3 h-3 mr-1"></i> Edit Discount
                  </Button>
                </div>
              )}
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="font-medium text-foreground">{formatCurrency(invoice.subtotal || 0)}</span>
                </div>

                {/* Discount editing */}
                {invoice.status === 'Pending' && isEditingDiscount ? (
                  <form onSubmit={discountForm.handleSubmit(onSubmitDiscount)} className="space-y-2" data-print-hide>
                    <div className="flex items-center space-x-2">
                      <Label htmlFor="discount-percentage" className="text-xs text-muted-foreground min-w-fit">Discount (%):</Label>
                      <Input id="discount-percentage" type="number" step="0.01" min="0" max="100" className="w-20 h-7 text-xs"
                        {...discountForm.register("discountPercentage", { valueAsNumber: true })} data-testid="input-discount-percentage" />
                      <div className="flex space-x-1">
                        <Button type="submit" size="sm" disabled={updateDiscountMutation.isPending}
                          className="h-7 px-2 bg-blue-600 hover:bg-blue-700 text-white" data-testid="button-save-discount">
                          {updateDiscountMutation.isPending ? <i className="fas fa-spinner fa-spin w-3 h-3"></i> : <i className="fas fa-check w-3 h-3"></i>}
                        </Button>
                        <Button type="button" variant="outline" size="sm" onClick={cancelDiscountEdit} className="h-7 px-2" data-testid="button-cancel-discount">
                          <i className="fas fa-times w-3 h-3"></i>
                        </Button>
                      </div>
                    </div>
                    {discountForm.formState.errors.discountPercentage && (
                      <p className="text-xs text-destructive">{discountForm.formState.errors.discountPercentage.message}</p>
                    )}
                  </form>
                ) : (
                  parseFloat(invoice.discountAmount || "0") > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Discount ({(parseFloat(invoice.discountPercentage || "0") * 100).toFixed(1)}%)</span>
                      <span className="font-medium text-green-600">-{formatCurrency(invoice.discountAmount || 0)}</span>
                    </div>
                  )
                )}

                <div className="flex justify-between">
                  <span className="text-muted-foreground">Tax ({(parseFloat(invoice.taxRate || "0") * 100).toFixed(1)}%)</span>
                  <span className="font-medium text-foreground">{formatCurrency(invoice.taxAmount || 0)}</span>
                </div>

                {/* Total Due — highlighted */}
                <div className="flex justify-between items-center bg-slate-900 dark:bg-slate-800 text-white rounded-md px-4 py-3 mt-2">
                  <span className="font-semibold text-sm">TOTAL DUE</span>
                  <span className="font-bold text-lg">{formatCurrency(invoice.total || 0)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Notes */}
          {invoice.notes && (
            <div className="mb-8">
              <p className="text-xs font-semibold uppercase tracking-widest text-rose-500 mb-2">Notes</p>
              <div className="border-t border-border pt-2">
                <p className="text-sm text-muted-foreground">{invoice.notes}</p>
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="border-t border-border pt-4 text-center">
            <p className="text-xs text-muted-foreground">
              Volume Fashion Collection &nbsp;|&nbsp; Guangzhou, China &nbsp;|&nbsp; +86 132 8868 9165
            </p>
            <p className="text-sm font-semibold text-foreground mt-2">Thank you for your business!</p>
          </div>
        </div>

        {/* Bottom accent bar */}
        <div className="h-1.5 bg-rose-500" />
      </div>
    </div>
  );
}