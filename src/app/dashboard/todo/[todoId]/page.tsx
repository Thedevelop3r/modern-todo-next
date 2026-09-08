"use client";
import { useRouter } from "next/navigation";
import React, { useEffect, useState } from "react";
// import { useStore } from "@/store/state";
import { capitalizeEachWord, getTodo, updateTodo, STATUS_MAP } from "@/utils";

export default function Todo({ params }: { params: { todoId: string } }) {
  const [todo, setTodo] = useState<Todo | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const todoId = params?.todoId;
  //   const { updateTodos, todos } = useStore();

  const handleEditTodo = async () => {
    setLoading(true);
    router.push(`/dashboard/edit-todo/${todoId}`);
    setLoading(false);
  };

  const handleGetTodo = async () => {
    setLoading(true);
    getTodo(todoId)
      .then((response) => {
        console.log("getting todo");
        return response;
      })
      .then((response) => response.json())
      .then((data) => {
        console.log(data);
        setTodo({
          ...data,
          title: capitalizeEachWord(data.title),
        });
        setLoading(false);
      })
      .catch((err) => {
        console.log(err);
        setLoading(false);
      });
  };

  const handleCopyId = async () => {
    navigator.clipboard.writeText(todoId);
  };

  useEffect(() => {
    if (todoId) {
      handleGetTodo();
    }
  }, [todoId]);

  return (
    <div className="flex flex-col flex-nowrap w-full h-full">
      <div className="flex flex-col flex-nowrap w-full h-full">
        <div className="flex flex-row flex-nowrap justify-between items-center w-full h-12 px-4 mb-10 border-b-2 py-2">
          <h1 className="text-2xl font-bold flex">
          <span
          onClick={() => {
            router.back();
          }}
          className='mr-4 bg-slate-200 px-2 text-center flex flex-row items-center justify-center py-0 cursor-pointer'>
          <p>{"<"}</p>
          </span>
            Todo{" "}
            <span onClick={handleCopyId} className="ml-2 my-auto px-2 text-lg rounded-md cursor-pointer bg-green-100 text-green-900">
              {todoId}
            </span>{" "}
          </h1>
          <div>
         
            <button
              className="mx-2 rounded-md border-green-600 border-2 py-1 px-6 hover:bg-green-600 hover:text-white"
              onClick={() => {
                handleGetTodo();
              }}
            >
              Refresh
            </button>
          </div>
        </div>
        <div className="flex flex-col w-full h-full gap-2">
          <div className="flex flex-row items-center py-2 px-2 bg-slate-50 rounded-md h-full">
            <p className="text-center font-bold text-4xl tracking-wider">{todo?.title}</p>
            <span className={`ml-auto text-sm text-white px-2 py-1 rounded-md ${STATUS_MAP[todo?.status ?? ""]}`}>{todo?.status}</span>
            <span className="ml-auto text-sm text-gray-500">Created at: {new Date(todo?.createdAt).toLocaleString()} <br/>Modified at: {new Date(todo?.updatedAt).toLocaleString()} </span>
          </div>

          <div className="py-2 px-2 bg-slate-200 rounded-md text-center font-bold text-2xl tracking-wider min-h-64 h-full">
            {/* description */}
            <p className="text-left font-bold text-2xl text-pretty tracking-wider">{todo?.description}</p>
          </div>

          {/* sticky save button on top right */}
          <div className="flex items-center justify-between sticky bottom-0 right-0">
            <button className="mx-2 rounded-md border-green-600 bg-green-600 border-2 py-1 px-6 text-white hover:bg-white hover:text-green-900" onClick={handleEditTodo}>
              Edit
            </button>
            <div className="ml-auto pr-4">
              <div className="">Title size: {todo?.title?.length}/40</div>
              <div className="">Description size: {todo?.description?.length}/1000</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
