"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowLeft, CheckSquare, UserPlus } from "lucide-react";
import { Button, Card, CardContent, Field, Input, ThemeToggle, useToast } from "@/components/ui";
import { useRegister } from "@/hooks/useAuth";
import { passwordStrength, registerSchema } from "@/lib/validation";
import { cn } from "@/lib/utils";

function StrengthMeter({ password }: { password: string }) {
  const { score, label, hint } = passwordStrength(password);
  const colors = ["bg-danger", "bg-danger", "bg-warning", "bg-info", "bg-success"];

  return (
    <div className="mt-2">
      <div className="flex gap-1">
        {[0, 1, 2, 3].map((index) => (
          <span
            key={index}
            className={cn("h-1 flex-1 rounded-full transition-colors", index < score ? colors[score] : "bg-surface-sunken")}
          />
        ))}
      </div>
      <p className="mt-1.5 text-xs text-fg-muted">
        <span className="font-medium text-fg">{label}</span> · {hint}
      </p>
    </div>
  );
}

export default function RegisterPage() {
  const router = useRouter();
  const toast = useToast();
  const register = useRegister();

  const [form, setForm] = React.useState({ name: "", email: "", password: "" });
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  const submit = (event: React.FormEvent) => {
    event.preventDefault();

    const result = registerSchema.safeParse(form);
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

    register.mutate(result.data, {
      onSuccess: () => {
        toast.success("Account created", { description: "Sign in to get started." });
        router.push("/login");
      },
      onError: (error) => {
        const message = (error as Error).message;
        // A duplicate email is the one field-specific failure worth pinning.
        setErrors(message.toLowerCase().includes("email") ? { email: message } : {});
        toast.error("Could not create account", { description: message });
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
            <h1 className="mt-5 text-2xl font-semibold tracking-tight text-fg">Create your account</h1>
            <p className="mt-1.5 text-sm text-fg-muted">It takes about ten seconds.</p>
          </div>

          <Card>
            <CardContent>
              <form onSubmit={submit} className="space-y-4" noValidate>
                <Field label="Name" error={errors.name} htmlFor="name" required>
                  <Input
                    id="name"
                    autoComplete="name"
                    placeholder="Your name"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    invalid={Boolean(errors.name)}
                  />
                </Field>

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
                    autoComplete="new-password"
                    placeholder="At least 8 characters"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    invalid={Boolean(errors.password)}
                  />
                  {form.password && <StrengthMeter password={form.password} />}
                </Field>

                <Button type="submit" block size="lg" loading={register.isPending}>
                  <UserPlus className="h-4 w-4" />
                  Create account
                </Button>
              </form>
            </CardContent>
          </Card>

          <p className="mt-5 text-center text-sm text-fg-muted">
            Already have an account?{" "}
            <Link href="/login" className="font-semibold text-primary hover:underline">
              Sign in
            </Link>
          </p>
        </motion.div>
      </div>
    </div>
  );
}
