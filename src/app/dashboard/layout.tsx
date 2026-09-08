"use client";

import Sidebar from "@/components/Dashboard/Sidebar";
import { getUser, getAllTodos } from "@/utils";
import Links from "@/utils/static.json";
import { useStore } from "@/store/state";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { updateUser, updateTodos, updatePagination, todoPagination } = useStore();
  const router = useRouter();

  useEffect(() => {
    getUser()
      .then((response) => {
        console.log("getting user");
        return response;
      })
      .then((response) => {
        if (response.status !== 200) {
          throw new Error("Unauthorized");
        }
        return response;
      })
      .then((response) => response.json())
      .then((data) => {
        console.log(data);
        updateUser({ user: data, isLoggedIn: true });
      })
      .then(() => getAllTodos({ filter: { page: todoPagination.page, limit: todoPagination.limit } }))
      .then((response) => {
        console.log("getting todos");
        return response;
      })
      .then((response) => response.json())
      .then((data) => {
        console.log(data);
        updateTodos({ todos: data?.data, todoMeta: data?.meta });
        updatePagination({ page: data?.meta?.page, limit: data?.meta?.limit });
      })
      .catch((err) => {
        console.log("Auth Error", err);
        router.push("/login");
      });
  }, []);

  return (
    <div className="flex flex-row flex-nowrap w-full h-full">
      <Sidebar navLinks={Links.navLinks} />
      <div className="flex flex-col flex-nowrap w-full h-full">
        <main className="flex flex-col flex-nowrap w-full h-full p-4">{children}</main>
      </div>
    </div>
  );
}
