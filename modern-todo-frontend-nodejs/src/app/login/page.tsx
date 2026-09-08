"use client";
import Link from "next/link";
import React, { FormEventHandler, useState } from "react";
import { API_ENDPOINT } from "@/utils/api_endpoint";
import { useStore } from "@/store/state"; // Import the StoreApi type // Import the StoreState type
import { useRouter } from "next/navigation";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const router = useRouter();

  // Update the type of the useStore hook
  const updateUser = useStore.getState().updateUser;

  const validPassword = (password: string) => {
    return password.length >= 8; //&& password.match(/(?=.*\d)(?=.*[a-z])(?=.*[A-Z]).{8,}/);
  };

  const handleSubmit: FormEventHandler<HTMLFormElement> = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const response = await fetch(API_ENDPOINT.login, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      });
      if (!response.ok) {
        console.log(await response.json());
        throw new Error("Login failed");
      }
      const responseBody = await response.json();
      console.log(responseBody);
      setIsSubmitting(false);
      // update state
      updateUser({ user: responseBody, isLoggedIn: true });
      router.push("/dashboard");
    } catch (error) {
      console.log(error);
      setIsSubmitting(false);
      alert("Login failed");
    }
  };

  return (
    <div className="flex flex-col items-center justify-start h-screen mt-20">
      <div className="w-full max-w-md">
        <form onSubmit={handleSubmit} className="bg-white shadow-md rounded px-8 pt-6 pb-8 mb-4">
          <div className="mb-4">
            <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="email">
              Email Address
            </label>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
              type="email"
              placeholder="Email Address"
              required
              pattern="[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,4}$"
            />
          </div>
          <div className="mb-6">
            <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="password">
              Password
            </label>
            <input
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                // modify error display input error display
                if (e.target.value.length === 0) {
                  e.target.classList.remove("border-green-500");
                  e.target.classList.add("border-red-500");
                } else if (validPassword(e.target.value)) {
                  e.target.classList.remove("border-red-500");
                  e.target.classList.add("border-green-500");
                }
              }}
              className="shadow appearance-none border border-red-500 rounded w-full py-2 px-3 text-gray-700 mb-3 leading-tight focus:outline-none focus:shadow-outline"
              type="password"
              placeholder="******************"
              required
              minLength={8}
              // pattern="(?=.*\d)(?=.*[a-z])(?=.*[A-Z]).{8,}"
            />
            {/* display allowed pattren, turn green when its matches */}
            {<div className={`text-xs italic ${validPassword(password) ? "text-green-500" : "text-red-600"}`}>Password must be at least 8 characters long.</div>}
          </div>
          <div className="flex items-center justify-between">
            <button disabled={isSubmitting} className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline" type="submit">
              {isSubmitting ? "Loading..." : "Sign In"}
            </button>
            <Link className="inline-block align-baseline font-bold text-sm text-blue-500 hover:text-blue-800" href="/forgot-password">
              Forgot Password?
            </Link>
          </div>
          {/* not a user register */}
          <div className="text-left mt-4">
            <p className="text-gray-500 text-sm inline-block">Not a user?</p>
            <Link className="ml-2 inline-block align-baseline font-bold text-sm text-blue-500 hover:text-blue-800" href="/register">
              Register Now
            </Link>
          </div>
        </form>

        <p className="text-center text-gray-500 text-xs">&copy;{new Date().getFullYear()} Tekvek. All rights reserved.</p>
      </div>
    </div>
  );
}
