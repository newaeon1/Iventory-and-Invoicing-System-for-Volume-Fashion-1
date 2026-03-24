import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";
import type { ProductsResponse, Product } from "@shared/schema";

export default function Products() {
  const { toast } = useToast();
  const [page, setPage] = useState(1);
  const urlSearch = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('search') || '' : '';
  const [filters, setFilters] = useState({
    search: urlSearch,
    category: "",
    size: "",
    stockLevel: ""
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const search = params.get('search');
    if (search) {
      setFilters(prev => ({ ...prev, search }));
      // Clear the URL param after reading it
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [bulkUploadFile, setBulkUploadFile] = useState<File | null>(null);

  const editProductSchema = z.object({
    productName: z.string().min(1, "Product name is required"),
    color: z.string().min(1, "Color is required"),
    size: z.string().min(1, "Size is required"),
    quantity: z.number().min(0, "Quantity must be 0 or greater"),
    price: z.number().gt(0, "Selling price must be greater than 0"),
    costPrice: z.number().min(0, "Cost price must be 0 or greater").optional(),
    manufacturer: z.string().optional(),
    category: z.string().optional(),
    description: z.string().optional(),
  });

  type EditProductForm = z.infer<typeof editProductSchema>;

  const editForm = useForm<EditProductForm>({
    resolver: zodResolver(editProductSchema),
    defaultValues: {
      productName: "",
      color: "",
      size: "",
      quantity: 0,
      price: 0,
      costPrice: undefined,
      manufacturer: "",
      category: "",
      description: "",
    },
  });

  const updateProductMutation = useMutation({
    mutationFn: async (data: EditProductForm & { id: string }) => {
      const response = await apiRequest("PUT", `/api/products/${data.id}`, {
        ...data,
        price: data.price.toString(),
        costPrice: data.costPrice != null ? data.costPrice.toString() : null,
      });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Product updated successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/metrics"] });
      setSelectedProduct(null);
      editForm.reset();
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
        description: "Failed to update product",
        variant: "destructive",
      });
    },
  });

  const { data: productsData, isLoading, error } = useQuery<ProductsResponse>({
    queryKey: ["/api/products", { page, limit: 12, ...filters }],
  });

  const deleteProductMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/products/${id}`);
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Product deleted successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
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
        description: "Failed to delete product",
        variant: "destructive",
      });
    },
  });

  const handleFilterChange = (key: string, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setPage(1);
  };

  const getStockBadge = (quantity: number) => {
    if (quantity === 0) {
      return <Badge variant="destructive">Out of Stock</Badge>;
    }
    if (quantity <= 5) {
      return <Badge variant="destructive">{quantity} Low Stock</Badge>;
    }
    return <Badge variant="secondary">{quantity} In Stock</Badge>;
  };

  const formatPrice = (price: string | number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(typeof price === 'string' ? parseFloat(price) : price);
  };

  const exportToCSV = async () => {
    try {
      // Fetch all products without pagination for export
      const response = await fetch('/api/products?limit=1000');
      const data: ProductsResponse = await response.json();
      
      if (!data.products || data.products.length === 0) {
        toast({
          title: "No Data",
          description: "No products found to export",
          variant: "destructive",
        });
        return;
      }

      // Create CSV headers
      const headers = [
        'Product ID',
        'Product Name', 
        'Color',
        'Size',
        'Quantity',
        'Price',
        'Category',
        'Description',
        'QR Code URL',
        'Created Date'
      ];

      // Convert products to CSV rows
      const csvRows = [
        headers.join(','),
        ...data.products.map(product => [
          `"${product.productId}"`,
          `"${product.productName}"`,
          `"${product.color}"`,
          `"${product.size}"`,
          product.quantity,
          product.price,
          `"${product.category || ''}"`,
          `"${product.description || ''}"`,
          `"${product.qrCodeUrl || ''}"`,
          `"${new Date(product.createdAt || '').toLocaleDateString()}"`
        ].join(','))
      ];

      // Create and download CSV file
      const csvContent = csvRows.join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `products_export_${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast({
        title: "Export Successful",
        description: `Exported ${data.products.length} products to CSV`,
      });

    } catch {
      toast({
        title: "Export Failed", 
        description: "Failed to export products. Please try again.",
        variant: "destructive",
      });
    }
  };

  const bulkUploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('csvFile', file);
      const response = await fetch('/api/products/bulk-upload', {
        method: 'POST',
        body: formData,
      });
      if (!response.ok) {
        const error = await response.text();
        throw new Error(error);
      }
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Bulk Upload Successful",
        description: `Successfully uploaded ${data.successCount} products. ${data.errorCount > 0 ? `${data.errorCount} errors occurred.` : ''}`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/metrics"] });
      setBulkUploadFile(null);
    },
    onError: (error) => {
      toast({
        title: "Bulk Upload Failed",
        description: error.message || "Failed to upload products",
        variant: "destructive",
      });
    },
  });

  const handleBulkUpload = () => {
    if (!bulkUploadFile) {
      toast({
        title: "No File Selected",
        description: "Please select a CSV file to upload",
        variant: "destructive",
      });
      return;
    }
    bulkUploadMutation.mutate(bulkUploadFile);
  };

  if (error) {
    return (
      <div className="text-center py-8">
        <i className="fas fa-exclamation-circle text-destructive text-4xl mb-4"></i>
        <p className="text-sm text-muted-foreground">Failed to load products</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filters and Actions */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex flex-col sm:flex-row flex-wrap items-start sm:items-center gap-4">
          <Input
            placeholder="Search products..."
            value={filters.search}
            onChange={(e) => handleFilterChange("search", e.target.value)}
            className="w-full sm:w-64"
            data-testid="input-search-products"
          />
          
          <Select value={filters.category} onValueChange={(value) => handleFilterChange("category", value)}>
            <SelectTrigger className="w-full sm:w-40" data-testid="select-category">
              <SelectValue placeholder="All Categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              <SelectItem value="Dresses">Dresses</SelectItem>
              <SelectItem value="Tops">Tops</SelectItem>
              <SelectItem value="Bottoms">Bottoms</SelectItem>
              <SelectItem value="Shoes">Shoes</SelectItem>
              <SelectItem value="Accessories">Accessories</SelectItem>
            </SelectContent>
          </Select>
          
          <Select value={filters.size} onValueChange={(value) => handleFilterChange("size", value)}>
            <SelectTrigger className="w-full sm:w-32" data-testid="select-size">
              <SelectValue placeholder="All Sizes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Sizes</SelectItem>
              <SelectItem value="XS">XS</SelectItem>
              <SelectItem value="S">S</SelectItem>
              <SelectItem value="M">M</SelectItem>
              <SelectItem value="L">L</SelectItem>
              <SelectItem value="XL">XL</SelectItem>
            </SelectContent>
          </Select>

          <Select value={filters.stockLevel} onValueChange={(value) => handleFilterChange("stockLevel", value)}>
            <SelectTrigger className="w-40" data-testid="select-stock-level">
              <SelectValue placeholder="All Stock Levels" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Stock Levels</SelectItem>
              <SelectItem value="in">In Stock</SelectItem>
              <SelectItem value="low">Low Stock</SelectItem>
              <SelectItem value="out">Out of Stock</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            onClick={exportToCSV}
            data-testid="button-export-csv"
          >
            <i className="fas fa-download mr-2"></i>
            Export CSV
          </Button>
          
          <div className="relative">
            <input
              type="file"
              accept=".csv"
              onChange={(e) => setBulkUploadFile(e.target.files?.[0] || null)}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              data-testid="input-bulk-upload-file"
            />
            <Button 
              variant="outline" 
              data-testid="button-select-bulk-upload"
            >
              <i className="fas fa-upload mr-2"></i>
              {bulkUploadFile ? bulkUploadFile.name.substring(0, 15) + '...' : 'Select CSV'}
            </Button>
          </div>
          
          {bulkUploadFile && (
            <Button 
              onClick={handleBulkUpload}
              disabled={bulkUploadMutation.isPending}
              data-testid="button-bulk-upload"
            >
              <i className="fas fa-cloud-upload-alt mr-2"></i>
              {bulkUploadMutation.isPending ? "Uploading..." : "Bulk Upload"}
            </Button>
          )}
          
          <Link href="/add-product">
            <Button data-testid="button-add-product">
              <i className="fas fa-plus mr-2"></i>
              Add Product
            </Button>
          </Link>
        </div>
      </div>

      {/* Products Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {Array.from({ length: 8 }).map((_, i) => (
            <Card key={i} className="overflow-hidden">
              <Skeleton className="w-full h-48" />
              <CardContent className="p-4">
                <Skeleton className="h-4 w-3/4 mb-2" />
                <Skeleton className="h-3 w-1/2 mb-4" />
                <div className="flex justify-between mb-3">
                  <Skeleton className="h-6 w-16" />
                  <Skeleton className="h-4 w-20" />
                </div>
                <Skeleton className="h-8 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {productsData?.products?.map((product: any) => (
              <Card key={product.id} className="overflow-hidden hover:shadow-lg transition-shadow" data-testid={`card-product-${product.id}`}>
                <div className="relative">
                  {product.imageUrl ? (
                    <img 
                      src={product.imageUrl} 
                      alt={product.productName} 
                      className="w-full h-48 object-cover"
                    />
                  ) : (
                    <div className="w-full h-48 bg-muted flex items-center justify-center">
                      <i className="fas fa-image text-muted-foreground text-2xl"></i>
                    </div>
                  )}
                  {product.qrCodeUrl && (
                    <div className="absolute top-2 right-2">
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button
                            variant="secondary"
                            size="sm"
                            className="bg-yellow-500 hover:bg-yellow-600 text-black font-semibold shadow-md"
                            data-testid={`button-qr-${product.id}`}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="mr-1.5">
                              <path d="M3 11H5V13H3V11M11 5H13V9H11V5M9 11H13V15H9V11M15 3H21V9H15V3M17 5H19V7H17V5M15 15H17V17H15V15M17 17H19V19H17V17M19 19H21V21H19V19M3 3H9V9H3V3M5 5H7V7H5V5M3 15H9V21H3V15M5 17H7V19H5V17Z"/>
                            </svg>
                            QR Code
                          </Button>
                        </DialogTrigger>
                      <DialogContent className="sm:max-w-md">
                        <DialogHeader>
                          <DialogTitle>QR Code - {product.productName}</DialogTitle>
                        </DialogHeader>
                        <div className="text-center p-6" id={`qr-print-area-${product.id}`}>
                          <img src={product.qrCodeUrl} alt="QR Code" className="w-48 h-48 mx-auto" />
                          <p className="text-base font-medium text-foreground mt-4">
                            {product.productName}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            Product ID: {product.productId}
                          </p>
                        </div>
                        <div className="flex justify-center pt-4">
                          <Button 
                            onClick={() => {
                              const printWindow = window.open('', '_blank');
                              const qrContent = document.getElementById(`qr-print-area-${product.id}`)?.innerHTML;
                              printWindow?.document.write(`
                                <html>
                                  <head>
                                    <title>QR Code - ${product.productName}</title>
                                    <style>
                                      body { 
                                        font-family: Arial, sans-serif; 
                                        text-align: center; 
                                        margin: 50px;
                                        background: white;
                                      }
                                      img { 
                                        max-width: 300px; 
                                        height: auto; 
                                      }
                                      .product-name {
                                        font-size: 18px;
                                        font-weight: bold;
                                        margin: 20px 0 10px 0;
                                        color: #000;
                                      }
                                      .product-id {
                                        font-size: 14px;
                                        color: #666;
                                        margin-bottom: 20px;
                                      }
                                    </style>
                                  </head>
                                  <body>
                                    <div class="qr-container">
                                      <img src="${window.location.origin}${product.qrCodeUrl}" alt="QR Code" />
                                      <div class="product-name">${product.productName}</div>
                                      <div class="product-id">Product ID: ${product.productId}</div>
                                    </div>
                                  </body>
                                </html>
                              `);
                              printWindow?.document.close();
                              const img = printWindow?.document.querySelector('img');
                              if (img && !img.complete) {
                                img.onload = () => printWindow?.print();
                                img.onerror = () => printWindow?.print();
                              } else {
                                printWindow?.print();
                              }
                            }}
                            className="bg-blue-600 hover:bg-blue-700 text-white"
                            data-testid={`button-print-qr-${product.id}`}
                          >
                            <i className="fas fa-print mr-2"></i>
                            Print QR Code
                          </Button>
                        </div>
                      </DialogContent>
                      </Dialog>
                    </div>
                  )}
                </div>
                
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="text-sm font-medium text-foreground line-clamp-2">{product.productName}</h3>
                  </div>
                  <p className="text-xs text-muted-foreground mb-2">{product.productId}</p>
                  
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-lg font-semibold text-foreground">{formatPrice(product.price)}</span>
                    <span className="text-sm text-muted-foreground">{product.color}</span>
                  </div>
                  {product.costPrice && (
                    <div className="mb-2">
                      <span className="text-xs text-muted-foreground">Cost: {formatPrice(product.costPrice)}</span>
                    </div>
                  )}
                  
                  {product.manufacturer && (
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-muted-foreground">Manufacturer:</span>
                      <span className="text-xs font-medium text-foreground">{product.manufacturer}</span>
                    </div>
                  )}
                  
                  <div className="mb-2">
                    {product.sizeBreakdown && typeof product.sizeBreakdown === 'object' && Object.keys(product.sizeBreakdown).length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {Object.entries(product.sizeBreakdown as Record<string, number>).map(([size, qty]) => (
                          <span key={size} className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary">
                            {qty}{size}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-sm text-muted-foreground">Size: {product.size}</span>
                    )}
                  </div>
                  <div className="flex items-center justify-between mb-4">
                    {getStockBadge(product.quantity)}
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Dialog open={selectedProduct?.id === product.id} onOpenChange={(open) => {
                      if (!open) {
                        setSelectedProduct(null);
                        editForm.reset();
                      }
                    }}>
                      <DialogTrigger asChild>
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="flex-1"
                          onClick={() => {
                            setSelectedProduct(product);
                            editForm.reset({
                              productName: product.productName,
                              color: product.color,
                              size: product.size,
                              quantity: Number(product.quantity),
                              price: Number(product.price),
                              costPrice: product.costPrice ? Number(product.costPrice) : undefined,
                              manufacturer: product.manufacturer || "",
                              category: product.category || "none",
                              description: product.description || "",
                            });
                          }}
                          data-testid={`button-edit-${product.id}`}
                        >
                          Edit
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="sm:max-w-md">
                        <DialogHeader>
                          <DialogTitle>Edit Product - {product.productName}</DialogTitle>
                        </DialogHeader>
                        <Form {...editForm}>
                          <form onSubmit={editForm.handleSubmit((data) => updateProductMutation.mutate({ ...data, id: product.id }))} className="space-y-4">
                            <div className="grid grid-cols-1 gap-4">
                              <FormField
                                control={editForm.control}
                                name="productName"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>Product Name</FormLabel>
                                    <FormControl>
                                      <Input {...field} />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                              
                              <div className="grid grid-cols-2 gap-2">
                                <FormField
                                  control={editForm.control}
                                  name="color"
                                  render={({ field }) => (
                                    <FormItem>
                                      <FormLabel>Color</FormLabel>
                                      <FormControl>
                                        <Input {...field} />
                                      </FormControl>
                                      <FormMessage />
                                    </FormItem>
                                  )}
                                />
                                
                                <FormField
                                  control={editForm.control}
                                  name="size"
                                  render={({ field }) => (
                                    <FormItem>
                                      <FormLabel>Size</FormLabel>
                                      <Select onValueChange={field.onChange} value={field.value}>
                                        <FormControl>
                                          <SelectTrigger>
                                            <SelectValue />
                                          </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                          <SelectItem value="XS">XS</SelectItem>
                                          <SelectItem value="S">S</SelectItem>
                                          <SelectItem value="M">M</SelectItem>
                                          <SelectItem value="L">L</SelectItem>
                                          <SelectItem value="XL">XL</SelectItem>
                                          <SelectItem value="XXL">XXL</SelectItem>
                                        </SelectContent>
                                      </Select>
                                      <FormMessage />
                                    </FormItem>
                                  )}
                                />
                              </div>
                              
                              <div className="grid grid-cols-2 gap-2">
                                <FormField
                                  control={editForm.control}
                                  name="quantity"
                                  render={({ field }) => (
                                    <FormItem>
                                      <FormLabel>Quantity</FormLabel>
                                      <FormControl>
                                        <Input 
                                          type="number" 
                                          min="0"
                                          {...field}
                                          onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                                        />
                                      </FormControl>
                                      <FormMessage />
                                    </FormItem>
                                  )}
                                />
                                
                                <FormField
                                  control={editForm.control}
                                  name="price"
                                  render={({ field }) => (
                                    <FormItem>
                                      <FormLabel>Selling Price ($) <span className="text-red-500">*</span></FormLabel>
                                      <FormControl>
                                        <Input
                                          type="number"
                                          step="0.01"
                                          min="0.01"
                                          {...field}
                                          onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                                        />
                                      </FormControl>
                                      <FormMessage />
                                    </FormItem>
                                  )}
                                />
                              </div>

                              <FormField
                                control={editForm.control}
                                name="costPrice"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>Cost Price ($)</FormLabel>
                                    <FormControl>
                                      <Input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        value={field.value ?? ""}
                                        onChange={(e) => field.onChange(e.target.value === "" ? undefined : parseFloat(e.target.value))}
                                        placeholder="Optional"
                                      />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                              
                              <FormField
                                control={editForm.control}
                                name="category"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>Category</FormLabel>
                                    <Select onValueChange={field.onChange} value={field.value}>
                                      <FormControl>
                                        <SelectTrigger>
                                          <SelectValue placeholder="Select category" />
                                        </SelectTrigger>
                                      </FormControl>
                                      <SelectContent>
                                        <SelectItem value="none">No Category</SelectItem>
                                        <SelectItem value="Dresses">Dresses</SelectItem>
                                        <SelectItem value="Tops">Tops</SelectItem>
                                        <SelectItem value="Bottoms">Bottoms</SelectItem>
                                        <SelectItem value="Shoes">Shoes</SelectItem>
                                        <SelectItem value="Accessories">Accessories</SelectItem>
                                      </SelectContent>
                                    </Select>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                              
                              <FormField
                                control={editForm.control}
                                name="manufacturer"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>Manufacturer</FormLabel>
                                    <FormControl>
                                      <Input {...field} placeholder="e.g., Nike, Adidas, Zara" />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                              
                              <FormField
                                control={editForm.control}
                                name="description"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>Description</FormLabel>
                                    <FormControl>
                                      <Input {...field} placeholder="Product description..." />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                            </div>
                            
                            <div className="flex items-center justify-end space-x-2 pt-4">
                              <Button 
                                type="button" 
                                variant="outline"
                                onClick={() => {
                                  setSelectedProduct(null);
                                  editForm.reset();
                                }}
                              >
                                Cancel
                              </Button>
                              <Button 
                                type="submit" 
                                disabled={updateProductMutation.isPending}
                              >
                                {updateProductMutation.isPending ? "Saving..." : "Save Changes"}
                              </Button>
                            </div>
                          </form>
                        </Form>
                      </DialogContent>
                    </Dialog>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={deleteProductMutation.isPending}
                          className="text-red-600 hover:text-white hover:bg-red-600 border-red-600 hover:border-red-600"
                          data-testid={`button-delete-${product.id}`}
                        >
                          {deleteProductMutation.isPending ? (
                            <i className="fas fa-spinner fa-spin w-4 h-4"></i>
                          ) : (
                            <img 
                              src="/attached_assets/Untitled design (3)_1757884288503.png" 
                              alt="Delete" 
                              className="w-4 h-4"
                            />
                          )}
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This move will delete your product permanently. This action cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel data-testid={`button-cancel-delete-${product.id}`}>
                            No, Don't Delete
                          </AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => deleteProductMutation.mutate(product.id)}
                            className="bg-red-600 hover:bg-red-700"
                            data-testid={`button-confirm-delete-${product.id}`}
                          >
                            Yes
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Pagination */}
          {productsData?.total && productsData.total > 12 && (
            <div className="flex items-center justify-between mt-8">
              <p className="text-sm text-muted-foreground">
                Showing {((page - 1) * 12) + 1} to {Math.min(page * 12, productsData?.total || 0)} of {productsData?.total || 0} results
              </p>
              <div className="flex items-center space-x-2">
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  data-testid="button-previous-page"
                >
                  Previous
                </Button>
                <span className="px-3 py-2 text-sm">{page}</span>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => setPage(p => p + 1)}
                  disabled={page * 12 >= (productsData?.total || 0)}
                  data-testid="button-next-page"
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* No products found */}
      {!isLoading && productsData?.products?.length === 0 && (
        <div className="text-center py-16">
          <i className="fas fa-box text-muted-foreground text-6xl mb-4"></i>
          <h3 className="text-lg font-semibold text-foreground mb-2">No products found</h3>
          <p className="text-muted-foreground mb-6">Get started by adding your first product</p>
          <Link href="/add-product">
            <Button data-testid="button-add-first-product">
              <i className="fas fa-plus mr-2"></i>
              Add Product
            </Button>
          </Link>
        </div>
      )}
    </div>
  );
}
