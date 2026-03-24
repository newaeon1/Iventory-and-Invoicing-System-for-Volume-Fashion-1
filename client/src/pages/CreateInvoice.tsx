import { useState, useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { z } from "zod";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";
import { BrowserQRCodeReader, BrowserBarcodeReader } from "@zxing/library";
import Tesseract from "tesseract.js";
import { SUPPORTED_CURRENCIES, type CurrencyCode } from "@shared/schema";

const createInvoiceSchema = z.object({
  customerName: z.string().min(1, "Customer name is required"),
  customerEmail: z.string().email("Valid email format").optional().or(z.literal("")),
  customerPhone: z.string().min(1, "Phone number is required"),
  customerAddress: z.string().optional(),
  taxRate: z.string().optional(),
  currency: z.string().default("USD"),
  notes: z.string().optional(),
});

type CreateInvoiceForm = z.infer<typeof createInvoiceSchema>;

interface InvoiceItem {
  productId: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  product: {
    id: string;
    productName: string;
    size: string;
    price: string;
    quantity: number;
  };
}

export default function CreateInvoice() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [showProductDialog, setShowProductDialog] = useState(false);
  const [invoiceItems, setInvoiceItems] = useState<InvoiceItem[]>([]);
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set());
  const [isScanning, setIsScanning] = useState(false);
  const barcodeInputRef = useRef<HTMLInputElement>(null);

  const form = useForm<CreateInvoiceForm>({
    resolver: zodResolver(createInvoiceSchema),
    defaultValues: {
      customerName: "",
      customerEmail: "",
      customerPhone: "",
      customerAddress: "",
      taxRate: "8.5",
      currency: "USD",
      notes: "",
    },
  });

  const { data: productsData } = useQuery({
    queryKey: ["/api/products", { limit: 100 }],
    enabled: showProductDialog,
  });

  const createInvoiceMutation = useMutation({
    mutationFn: async (data: { invoice: any; items: any[] }) => {
      const response = await apiRequest("POST", "/api/invoices", data);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Invoice created successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/metrics"] });
      navigate("/invoices");
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
        description: "Failed to create invoice",
        variant: "destructive",
      });
    },
  });

  const addProductToInvoice = (product: any) => {
    if (selectedProducts.has(product.id)) {
      toast({
        title: "Info",
        description: "Product already added to invoice",
        variant: "destructive",
      });
      return;
    }

    if (product.quantity <= 0) {
      toast({
        title: "Out of Stock",
        description: `${product.productName} is out of stock and cannot be added to the invoice.`,
        variant: "destructive",
      });
      return;
    }

    const unitPrice = parseFloat(product.price);
    const newItem: InvoiceItem = {
      productId: product.id,
      quantity: 1,
      unitPrice,
      totalPrice: unitPrice,
      product: {
        id: product.id,
        productName: product.productName,
        size: product.size,
        price: product.price,
        quantity: product.quantity,
      },
    };

    setInvoiceItems(prev => [...prev, newItem]);
    setSelectedProducts(prev => new Set(Array.from(prev).concat([product.id])));
    setShowProductDialog(false);
  };

  const updateQuantity = (index: number, quantity: number) => {
    if (quantity < 1) return;
    
    const item = invoiceItems[index];
    const availableStock = item.product.quantity;
    
    if (quantity > availableStock) {
      toast({
        title: "Insufficient Stock",
        description: `Only ${availableStock} units of ${item.product.productName} are available in stock. Cannot add ${quantity} units.`,
        variant: "destructive",
      });
      return;
    }
    
    setInvoiceItems(prev => prev.map((item, i) => {
      if (i === index) {
        return {
          ...item,
          quantity,
          totalPrice: item.unitPrice * quantity,
        };
      }
      return item;
    }));
  };

  const removeItem = (index: number) => {
    const item = invoiceItems[index];
    setInvoiceItems(prev => prev.filter((_, i) => i !== index));
    setSelectedProducts(prev => {
      const newSet = new Set(prev);
      newSet.delete(item.productId);
      return newSet;
    });
  };

  const handleBarcodeUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsScanning(true);
    try {
      // Create an image element to load the file
      const img = new Image();
      const reader = new FileReader();

      reader.onload = async (e) => {
        img.src = e.target?.result as string;
        img.onload = async () => {
          try {
            let decodedText = null;
            let scanMethod = "";
            
            // First try QR code reader
            try {
              const qrCodeReader = new BrowserQRCodeReader();
              const result = await qrCodeReader.decodeFromImageElement(img);
              decodedText = result.getText();
              scanMethod = "QR code";
            } catch (qrError) {
              // If QR fails, try barcode reader
              try {
                const barcodeReader = new BrowserBarcodeReader();
                const result = await barcodeReader.decodeFromImageElement(img);
                decodedText = result.getText();
                scanMethod = "barcode";
              } catch (barcodeError) {
                // If both barcode readers fail, try OCR to read text under barcode
                try {
                  const { data: { text } } = await Tesseract.recognize(
                    img,
                    'eng',
                    {
                      logger: () => {}
                    }
                  );
                  
                  // Extract product ID from OCR text (clean up whitespace and get numbers)
                  const cleanedText = text.trim().replace(/\s+/g, '');
                  // Look for patterns like product IDs (alphanumeric sequences)
                  const productIdMatch = cleanedText.match(/[A-Z0-9]{3,}/i);
                  
                  if (productIdMatch) {
                    decodedText = productIdMatch[0];
                    scanMethod = "OCR";
                  }
                } catch (ocrError) {
                  // OCR failed
                }
              }
            }

            if (decodedText) {
              // Check if decoded text is a URL containing a product UUID
              // QR codes generate URLs like: http://localhost:5000/products/{uuid}
              let lookupId = decodedText;
              let lookupByUuid = false;
              try {
                const url = new URL(decodedText);
                const pathMatch = url.pathname.match(/\/products\/([a-f0-9-]+)$/i);
                if (pathMatch) {
                  lookupId = pathMatch[1];
                  lookupByUuid = true;
                }
              } catch {
                // Not a URL, use as-is (product ID)
              }

              // Try looking up by UUID first (from QR code URL), then by productId
              let product = null;
              if (lookupByUuid) {
                const uuidResponse = await fetch(`/api/products/${lookupId}`, { credentials: 'include' });
                if (uuidResponse.ok) {
                  product = await uuidResponse.json();
                }
              }
              if (!product) {
                const pidResponse = await fetch(`/api/products/by-product-id/${lookupId}`, { credentials: 'include' });
                if (pidResponse.ok) {
                  product = await pidResponse.json();
                }
              }

              if (product) {
                addProductToInvoice(product);
                toast({
                  title: "Success",
                  description: `Product "${product.productName}" added via ${scanMethod}`,
                });
              } else {
                toast({
                  title: "Product Not Found",
                  description: `No product found with ID: ${lookupId}`,
                  variant: "destructive",
                });
              }
            } else {
              toast({
                title: "Scanning Failed",
                description: "Could not read QR code from image. Please try again with a clearer image (PNG, JPG, or PDF).",
                variant: "destructive",
              });
            }
          } catch (error) {
            toast({
              title: "Scanning Failed",
              description: "An error occurred while processing the image.",
              variant: "destructive",
            });
          } finally {
            setIsScanning(false);
            // Reset the file input
            if (barcodeInputRef.current) {
              barcodeInputRef.current.value = '';
            }
          }
        };
      };

      reader.readAsDataURL(file);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to read the image file",
        variant: "destructive",
      });
      setIsScanning(false);
    }
  };

  const calculateTotals = () => {
    const subtotal = invoiceItems.reduce((sum, item) => sum + item.totalPrice, 0);
    const taxRate = parseFloat(form.watch("taxRate") || "8.5") / 100;
    const taxAmount = subtotal * taxRate;
    const total = subtotal + taxAmount;
    
    return { subtotal, taxAmount, total };
  };

  const { subtotal, taxAmount, total } = calculateTotals();

  const onSubmit = async (data: CreateInvoiceForm) => {
    if (invoiceItems.length === 0) {
      toast({
        title: "Error",
        description: "Please add at least one product to the invoice",
        variant: "destructive",
      });
      return;
    }

    const invoiceData = {
      ...data,
      subtotal: subtotal.toFixed(2),
      discountPercentage: "0.0000",
      discountAmount: "0.00",
      taxRate: (parseFloat(data.taxRate || "8.5") / 100).toFixed(4),
      taxAmount: taxAmount.toFixed(2),
      total: total.toFixed(2),
      currency: data.currency || "USD",
    };

    const itemsData = invoiceItems.map(item => ({
      productId: item.productId,
      quantity: item.quantity,
      unitPrice: item.unitPrice.toFixed(2),
      totalPrice: item.totalPrice.toFixed(2),
    }));

    createInvoiceMutation.mutate({
      invoice: invoiceData,
      items: itemsData,
    });
  };

  const selectedCurrency = form.watch("currency") || "USD";

  const formatCurrencyAmount = (amount: number) => {
    const curr = SUPPORTED_CURRENCIES[selectedCurrency as CurrencyCode];
    if (!curr) {
      return `${selectedCurrency} ${amount.toFixed(2)}`;
    }
    return `${curr.symbol}${amount.toFixed(2)}`;
  };

  return (
    <div className="max-w-4xl mx-auto">
      <Card>
        <CardContent className="p-6">
          <h3 className="text-lg font-semibold text-foreground mb-6">Create New Invoice</h3>
          
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              {/* Customer Information */}
              <div className="bg-muted rounded-lg p-4">
                <h4 className="text-sm font-medium text-foreground mb-4">Customer Information</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="customerName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Customer Name</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="Enter customer name" 
                            {...field}
                            data-testid="input-customer-name"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="customerEmail"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email (Optional)</FormLabel>
                        <FormControl>
                          <Input 
                            type="email"
                            placeholder="customer@email.com" 
                            {...field}
                            data-testid="input-customer-email"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="customerPhone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Phone</FormLabel>
                        <FormControl>
                          <Input 
                            type="tel"
                            placeholder="+1 (555) 123-4567" 
                            {...field}
                            data-testid="input-customer-phone"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="customerAddress"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Address (Optional)</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="Customer address" 
                            {...field}
                            data-testid="input-customer-address"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              {/* Product Selection */}
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-sm font-medium text-foreground">Invoice Items</h4>
                  <div className="flex gap-2">
                    <input
                      ref={barcodeInputRef}
                      type="file"
                      accept="image/*,application/pdf"
                      onChange={handleBarcodeUpload}
                      className="hidden"
                      data-testid="input-qr-file"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => barcodeInputRef.current?.click()}
                      disabled={isScanning}
                      data-testid="button-scan-qr"
                    >
                      {isScanning ? (
                        <>
                          <i className="fas fa-spinner fa-spin mr-2"></i>
                          Scanning...
                        </>
                      ) : (
                        <>
                          <i className="fas fa-qrcode mr-2"></i>
                          Scan QR Code
                        </>
                      )}
                    </Button>
                    <Dialog open={showProductDialog} onOpenChange={setShowProductDialog}>
                      <DialogTrigger asChild>
                        <Button type="button" data-testid="button-add-product">
                          <i className="fas fa-plus mr-2"></i>
                          Add Product
                        </Button>
                      </DialogTrigger>
                    <DialogContent className="sm:max-w-4xl">
                      <DialogHeader>
                        <DialogTitle>Select Products</DialogTitle>
                      </DialogHeader>
                      <div className="max-h-96 overflow-y-auto">
                        {(productsData as any)?.products?.length ? (
                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                            {(productsData as any).products.map((product: any) => (
                              <Card 
                                key={product.id} 
                                className={`cursor-pointer transition-colors ${
                                  selectedProducts.has(product.id) ? 'bg-muted' : 'hover:bg-muted'
                                }`}
                                onClick={() => addProductToInvoice(product)}
                                data-testid={`product-option-${product.id}`}
                              >
                                <CardContent className="p-4">
                                  <div className="flex space-x-4">
                                    <div className="flex-shrink-0">
                                      <div className="w-16 h-16 bg-muted rounded-md flex items-center justify-center">
                                        {product.imageUrl ? (
                                          <img 
                                            src={product.imageUrl} 
                                            alt={product.productName} 
                                            className="w-16 h-16 rounded-md object-cover"
                                          />
                                        ) : (
                                          <i className="fas fa-image text-muted-foreground text-lg"></i>
                                        )}
                                      </div>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-start justify-between">
                                        <div className="flex-1 min-w-0">
                                          <h5 className="font-semibold text-foreground truncate" data-testid={`product-name-${product.id}`}>
                                            {product.productName}
                                          </h5>
                                          <p className="text-sm text-muted-foreground mb-2" data-testid={`product-id-${product.id}`}>
                                            ID: {product.productId}
                                          </p>
                                        </div>
                                        {selectedProducts.has(product.id) && (
                                          <i className="fas fa-check text-accent ml-2 flex-shrink-0"></i>
                                        )}
                                      </div>
                                      
                                      {/* Product attributes */}
                                      <div className="space-y-2">
                                        <div className="flex flex-wrap gap-2">
                                          {product.sizeBreakdown && typeof product.sizeBreakdown === 'object' && Object.keys(product.sizeBreakdown).length > 0 ? (
                                            Object.entries(product.sizeBreakdown as Record<string, number>).map(([size, qty]: [string, number]) => (
                                              <Badge key={size} variant="outline" className="text-xs">
                                                {qty}{size}
                                              </Badge>
                                            ))
                                          ) : (
                                            <Badge variant="outline" className="text-xs" data-testid={`product-size-${product.id}`}>
                                              Size: {product.size}
                                            </Badge>
                                          )}
                                          {product.color && (
                                            <Badge variant="outline" className="text-xs flex items-center gap-1" data-testid={`product-color-${product.id}`}>
                                              <div 
                                                className="w-3 h-3 rounded-full border border-gray-300"
                                                style={{ backgroundColor: product.color.toLowerCase() }}
                                                title={product.color}
                                              ></div>
                                              {product.color}
                                            </Badge>
                                          )}
                                          {product.manufacturer && (
                                            <Badge variant="secondary" className="text-xs" data-testid={`product-manufacturer-${product.id}`}>
                                              {product.manufacturer}
                                            </Badge>
                                          )}
                                        </div>
                                        
                                        {product.category && (
                                          <div className="flex items-center gap-1">
                                            <i className="fas fa-tag text-muted-foreground text-xs"></i>
                                            <span className="text-xs text-muted-foreground" data-testid={`product-category-${product.id}`}>
                                              {product.category}
                                            </span>
                                          </div>
                                        )}
                                        
                                        {product.description && (
                                          <p className="text-xs text-muted-foreground line-clamp-2" 
                                             title={product.description}
                                             data-testid={`product-description-${product.id}`}>
                                            {product.description.length > 80 
                                              ? product.description.substring(0, 80) + '...' 
                                              : product.description}
                                          </p>
                                        )}
                                        
                                        <div className="flex items-center justify-between pt-1">
                                          <div className="flex items-center gap-2">
                                            <span className="font-semibold text-foreground" data-testid={`product-price-${product.id}`}>
                                              {formatCurrencyAmount(parseFloat(product.price))}
                                            </span>
                                            <Badge 
                                              variant={product.quantity > 10 ? "secondary" : product.quantity > 0 ? "outline" : "destructive"}
                                              className="text-xs"
                                              data-testid={`product-stock-${product.id}`}
                                            >
                                              {product.quantity} in stock
                                            </Badge>
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                </CardContent>
                              </Card>
                            ))}
                          </div>
                        ) : (
                          <div className="text-center py-8">
                            <i className="fas fa-box text-muted-foreground text-3xl mb-4"></i>
                            <p className="text-sm text-muted-foreground">No products available</p>
                          </div>
                        )}
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
              </div>

              {/* Invoice Items Table */}
                <div className="bg-background border border-input rounded-lg overflow-x-auto">
                  <table className="w-full min-w-[500px]">
                    <thead className="bg-muted">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Product</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Size</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Qty</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Price</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Total</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {invoiceItems.length > 0 ? (
                        invoiceItems.map((item, index) => (
                          <tr key={index} data-testid={`invoice-item-${index}`}>
                            <td className="px-4 py-3 text-sm text-foreground">{item.product.productName}</td>
                            <td className="px-4 py-3 text-sm text-muted-foreground">{item.product.size}</td>
                            <td className="px-4 py-3">
                              <Input
                                type="number"
                                value={item.quantity}
                                min="1"
                                className="w-16"
                                onChange={(e) => updateQuantity(index, parseInt(e.target.value) || 1)}
                                data-testid={`input-quantity-${index}`}
                              />
                            </td>
                            <td className="px-4 py-3 text-sm text-foreground">{formatCurrencyAmount(item.unitPrice)}</td>
                            <td className="px-4 py-3 text-sm font-medium text-foreground">{formatCurrencyAmount(item.totalPrice)}</td>
                            <td className="px-4 py-3">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => removeItem(index)}
                                className="text-red-600 hover:text-white hover:bg-red-600"
                                data-testid={`button-remove-${index}`}
                              >
                                <i className="fas fa-trash w-4 h-4"></i>
                              </Button>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                            No items added. Click "Add Product" to get started.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Invoice Totals */}
                {invoiceItems.length > 0 && (
                  <div className="bg-muted rounded-lg p-4 mt-4">
                    <div className="flex flex-col md:flex-row justify-between items-start gap-4">
                      <div className="w-full md:w-1/2 space-y-4">
                        {/* Currency Selector */}
                        <FormField
                          control={form.control}
                          name="currency"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Currency</FormLabel>
                              <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl>
                                  <SelectTrigger className="w-48" data-testid="select-currency">
                                    <SelectValue placeholder="Select currency" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {Object.entries(SUPPORTED_CURRENCIES).map(([code, info]) => (
                                    <SelectItem key={code} value={code}>
                                      {info.symbol} {info.name} ({code})
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        {/* Tax Rate Input */}
                        <FormField
                          control={form.control}
                          name="taxRate"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Tax Rate (%)</FormLabel>
                              <FormControl>
                                <Input
                                  type="number"
                                  min="0"
                                  max="50"
                                  step="0.1"
                                  placeholder="8.5"
                                  {...field}
                                  data-testid="input-tax-rate"
                                  className="w-32"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      
                      <div className="w-full md:w-64 space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Subtotal:</span>
                          <span className="text-foreground font-medium" data-testid="text-subtotal">
                            {formatCurrencyAmount(subtotal)}
                          </span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Tax ({form.watch("taxRate") || "8.5"}%):</span>
                          <span className="text-foreground font-medium" data-testid="text-tax">
                            {formatCurrencyAmount(taxAmount)}
                          </span>
                        </div>
                        <div className="border-t border-border pt-2">
                          <div className="flex justify-between text-base font-semibold">
                            <span className="text-foreground">Total:</span>
                            <span className="text-foreground" data-testid="text-total">
                              {formatCurrencyAmount(total)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Additional Notes */}
              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes (Optional)</FormLabel>
                    <FormControl>
                      <Textarea 
                        rows={3}
                        placeholder="Add any additional notes..." 
                        className="resize-none"
                        {...field}
                        data-testid="input-notes"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Form Actions */}
              <div className="flex items-center justify-end space-x-4">
                <Button 
                  type="button" 
                  variant="outline"
                  onClick={() => navigate("/invoices")}
                  data-testid="button-cancel"
                >
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  disabled={createInvoiceMutation.isPending}
                  data-testid="button-create-invoice"
                >
                  <i className="fas fa-save mr-2"></i>
                  {createInvoiceMutation.isPending ? "Creating..." : "Create Invoice"}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
