"use client";

import * as React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowLeft, CheckSquare, LogIn } from "lucide-react";
import { Button, Card, CardContent, Field, Input, ThemeToggle, useToast } from "@/components/ui";
import { useLogin } from "@/hooks/useAuth";
import { loginSchema } from "@/lib/validation";

export default function LoginPage() {
  const toast = useToast();
  const login = useLogin();

  const [form, setForm] = React.useState({ email: "", password: "" });
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  const submit = (event: React.FormEvent) => {
    event.preventDefault();

    const result = loginSchema.safeParse(form);
    if (!result.success) {
      const found: Record<string, string> = {};
      result.error.issues.forEach((issue) => {
        const key = issue.path[0];
        if (typeof key === "string" && !found[key]) found[key] = issue.message;
      });
      setErrors(found);
      return;
    }
    setErrors({});

    login.mutate(result.data, {
      onError: (error) => {
        // The API answers the same way for a bad email and a bad password.
        const message = (error as Error).message;
        setErrors({ password: message });
        toast.error("Could not sign in", { description: message });
      },
    });
  };

  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <div className="flex items-center justify-between px-4 py-4 sm:px-6">
        <Link href="/" className="flex items-center gap-1.5 text-sm font-medium text-fg-muted transition-colors hover:text-fg">
          <ArrowLeft className="h-4 w-4" />
          Back
        </Link>
        <ThemeToggle />
      </div>

      <div className="flex flex-1 items-center justify-center px-4 py-8">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          className="w-full max-w-md"
        >
          <div className="mb-8 text-center">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-fg shadow-glow">
              <CheckSquare className="h-6 w-6" />
            </span>
            <h1 className="mt-5 text-2xl font-semibold tracking-tight text-fg">Welcome back</h1>
            <p className="mt-1.5 text-sm text-fg-muted">Sign in to pick up where you left off.</p>
          </div>

          <Card>
            <CardContent>
              <form onSubmit={submit} className="space-y-4" noValidate>
                <Field label="Email address" error={errors.email} htmlFor="email" required>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    invalid={Boolean(errors.email)}
                  />
                </Field>

                <Field label="Password" error={errors.password} htmlFor="password" required>
                  <Input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    placeholder="••••••••"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    invalid={Boolean(errors.password)}
                  />
                </Field>

                <Button type="submit" block size="lg" loading={login.isPending}>
                  <LogIn className="h-4 w-4" />
                  Sign in
                </Button>
              </form>
            </CardContent>
          </Card>

          <p className="mt-5 text-center text-sm text-fg-muted">
            New here?{" "}
            <Link href="/register" className="font-semibold text-primary hover:underline">
              Create an account
            </Link>
          </p>
        </motion.div>
      </div>
    </div>
  );
}
