import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import Dashboard from "@/pages/Dashboard";
import { useState } from "react";
import Products from "@/pages/Products";
import ProductDetail from "@/pages/ProductDetail";
import AddProduct from "@/pages/AddProduct";
import BulkUpload from "@/pages/BulkUpload";
import Invoices from "@/pages/Invoices";
import CreateInvoice from "@/pages/CreateInvoice";
import InvoiceDetail from "@/pages/InvoiceDetail";
import UserManagement from "@/pages/UserManagement";
import ActivityLogs from "@/pages/ActivityLogs";
import Reports from "@/pages/Reports";
import Customers from "@/pages/Customers";
import Manufacturers from "@/pages/Manufacturers";
import ProtectedRoute from "@/components/ProtectedRoute";

interface LayoutProps {
  page: string;
}

const pageComponents = {
  dashboard: Dashboard,
  products: Products,
  "product-detail": ProductDetail,
  "add-product": AddProduct,
  "bulk-upload": BulkUpload,
  invoices: Invoices,
  "invoice-detail": InvoiceDetail,
  "create-invoice": CreateInvoice,
  users: UserManagement,
  "activity-logs": ActivityLogs,
  reports: Reports,
  customers: Customers,
  manufacturers: Manufacturers,
};

const pageTitles = {
  dashboard: 'Dashboard',
  products: 'Products',
  "product-detail": 'Product Details',
  "add-product": 'Add Product',
  "bulk-upload": 'Bulk Upload',
  invoices: 'Invoices',
  "invoice-detail": 'Invoice Details',
  "create-invoice": 'Create Invoice',
  users: 'User Management',
  "activity-logs": 'Activity Logs',
  reports: 'Reports & Analytics',
  customers: 'Customers',
  manufacturers: 'Manufacturers',
};

export default function Layout({ page }: LayoutProps) {
  const PageComponent = pageComponents[page as keyof typeof pageComponents] || Dashboard;
  const pageTitle = pageTitles[page as keyof typeof pageTitles] || 'Dashboard';
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  return (
    <ProtectedRoute>
      <div className="min-h-screen flex bg-background">
        {/* Desktop Sidebar */}
        <div className="hidden lg:block">
          <Sidebar currentPage={page} />
        </div>
        
        {/* Mobile Sidebar Overlay */}
        {isSidebarOpen && (
          <div className="lg:hidden fixed inset-0 z-50 flex">
            <div 
              className="fixed inset-0 bg-black bg-opacity-50" 
              onClick={() => setIsSidebarOpen(false)}
            />
            <div className="relative">
              <Sidebar currentPage={page} onClose={() => setIsSidebarOpen(false)} />
            </div>
          </div>
        )}
        
        <main className="flex-1 overflow-hidden flex flex-col">
          <Header 
            title={pageTitle} 
            onMenuClick={() => setIsSidebarOpen(true)}
          />
          <div className="flex-1 overflow-y-auto p-3 lg:p-6">
            <PageComponent />
          </div>
          <Footer />
        </main>
      </div>
    </ProtectedRoute>
  );
}
