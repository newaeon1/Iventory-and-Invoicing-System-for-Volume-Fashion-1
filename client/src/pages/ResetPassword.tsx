import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";

const resetPasswordSchema = z.object({
  newPassword: z.string().min(6, "Password must be at least 6 characters long"),
  confirmPassword: z.string().min(6, "Password must be at least 6 characters long"),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

type ResetPasswordForm = z.infer<typeof resetPasswordSchema>;

export default function ResetPassword() {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [isValidating, setIsValidating] = useState(true);
  const [isValidToken, setIsValidToken] = useState(false);
  const [token, setToken] = useState<string>("");

  const form = useForm<ResetPasswordForm>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: {
      newPassword: "",
      confirmPassword: "",
    },
  });

  useEffect(() => {
    // Get token from URL params
    const urlParams = new URLSearchParams(window.location.search);
    const tokenParam = urlParams.get('token');
    
    if (!tokenParam) {
      toast({
        title: "Invalid Link",
        description: "This password reset link is invalid or missing a token.",
        variant: "destructive",
      });
      setIsValidating(false);
      return;
    }

    setToken(tokenParam);
    
    // Validate token
    const validateToken = async () => {
      try {
        const response = await fetch("/api/auth/password/validate", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ token: tokenParam }),
          credentials: "include",
        });

        if (response.ok) {
          const data = await response.json();
          setIsValidToken(data.valid);
          if (!data.valid) {
            toast({
              title: "Invalid Token",
              description: "This password reset link is invalid or has expired.",
              variant: "destructive",
            });
          }
        } else {
          toast({
            title: "Validation Failed",
            description: "Unable to validate the reset token.",
            variant: "destructive",
          });
        }
      } catch (error) {
        toast({
          title: "Connection Error",
          description: "Unable to connect to server. Please try again.",
          variant: "destructive",
        });
      } finally {
        setIsValidating(false);
      }
    };

    validateToken();
  }, [toast]);

  const onSubmit = async (data: ResetPasswordForm) => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/auth/password/reset", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ 
          token,
          newPassword: data.newPassword 
        }),
        credentials: "include",
      });

      if (response.ok) {
        toast({
          title: "Password Reset Successful",
          description: "Your password has been reset successfully. You can now login with your new password.",
          variant: "default",
        });
        // Redirect to login after 2 seconds
        setTimeout(() => {
          window.location.href = '/login';
        }, 2000);
      } else {
        const error = await response.json();
        toast({
          title: "Reset Failed",
          description: error.message || "Failed to reset password",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Reset Failed",
        description: "Unable to connect to server. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (isValidating) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900 p-4">
        <div className="w-full max-w-md">
          <Card className="bg-gray-800 border-gray-700">
            <CardContent className="pt-6">
              <div className="text-center">
                <i className="fas fa-spinner fa-spin text-blue-400 text-2xl mb-4"></i>
                <p className="text-white">Validating reset token...</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (!isValidToken) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900 p-4">
        <div className="w-full max-w-md">
          <Card className="bg-gray-800 border-gray-700">
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 w-20 h-20 flex items-center justify-center">
                <img 
                  src="/attached_assets/image_1757421254360.png" 
                  alt="Volume Fashion Logo" 
                  className="w-16 h-16 rounded-full object-cover"
                />
              </div>
              <CardTitle className="text-2xl font-bold text-white">Invalid Reset Link</CardTitle>
              <p className="text-gray-300">This password reset link is invalid or has expired</p>
            </CardHeader>
            <CardContent>
              <div className="text-center space-y-4">
                <p className="text-gray-400">The reset link may have expired or already been used.</p>
                <Button 
                  onClick={() => window.location.href = '/forgot-password'}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                  data-testid="button-request-new"
                >
                  <i className="fas fa-paper-plane mr-2"></i>
                  Request New Reset Link
                </Button>
                <button
                  type="button"
                  onClick={() => window.location.href = '/login'}
                  className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
                  data-testid="link-back-to-login"
                >
                  ← Back to Login
                </button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900 p-4">
      <div className="w-full max-w-md">
        <Card className="bg-gray-800 border-gray-700">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 w-20 h-20 flex items-center justify-center">
              <img 
                src="/attached_assets/image_1757421254360.png" 
                alt="Volume Fashion Logo" 
                className="w-16 h-16 rounded-full object-cover"
              />
            </div>
            <CardTitle className="text-2xl font-bold text-white">Reset Password</CardTitle>
            <p className="text-gray-300">Enter your new password</p>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="newPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-gray-200">New Password</FormLabel>
                      <FormControl>
                        <Input 
                          {...field} 
                          type="password"
                          placeholder="Enter your new password"
                          disabled={isLoading}
                          data-testid="input-new-password"
                          className="bg-gray-700 border-gray-600 text-white placeholder:text-gray-400 focus:border-blue-500"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="confirmPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-gray-200">Confirm Password</FormLabel>
                      <FormControl>
                        <Input 
                          {...field} 
                          type="password"
                          placeholder="Confirm your new password"
                          disabled={isLoading}
                          data-testid="input-confirm-password"
                          className="bg-gray-700 border-gray-600 text-white placeholder:text-gray-400 focus:border-blue-500"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button 
                  type="submit" 
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white" 
                  disabled={isLoading}
                  data-testid="button-reset-password"
                >
                  {isLoading ? (
                    <>
                      <i className="fas fa-spinner fa-spin mr-2"></i>
                      Resetting...
                    </>
                  ) : (
                    <>
                      <i className="fas fa-key mr-2"></i>
                      Reset Password
                    </>
                  )}
                </Button>

                <div className="text-center mt-4">
                  <button
                    type="button"
                    onClick={() => window.location.href = '/login'}
                    className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
                    data-testid="link-back-to-login"
                  >
                    ← Back to Login
                  </button>
                </div>
              </form>
            </Form>

            <div className="mt-6 p-4 bg-gray-700 rounded-lg text-left">
              <p className="text-sm font-medium text-gray-200 mb-2">Volume Fashion Collection</p>
              <div className="text-xs text-gray-300 space-y-1">
                <p>Address: 4006-4008Room, 5Floor,changjiang Internation Garment Building ,No.931,Renmingbei Road , Yuexiu District,Guangzhou.China</p>
                <p>Phone: <a href="tel:+8613288689165" className="text-blue-400 hover:text-blue-300">+86 132 8868 9165</a></p>
                <p>
                  WhatsApp:
                  <a 
                    href="https://wa.link/mb5xbk" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-green-400 hover:text-green-300 ml-1"
                  >
                    +962796100166
                  </a>
                  . 
                  <a 
                    href="https://wa.link/g3bblj" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-green-400 hover:text-green-300"
                  >
                    +8613660002778
                  </a>
                </p>
                <p>
                  <a 
                    href="https://instagram.com/volume_fashion1" 
                    target="_blank" 
                    style={{textDecoration: 'none', color: 'inherit'}}
                    className="inline-flex items-center"
                  >
                    <i className="fab fa-instagram" style={{fontSize: '20px', verticalAlign: 'middle', marginRight: '5px', color: '#E1306C'}}></i>
                    <span>@volume_fashion1</span>
                  </a>
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}