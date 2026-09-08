"use client";
import React, { useEffect } from "react";
import { useStore } from "@/store/state";
import { getTrash, recoverTrashTodo, deleteTrashTodo } from "@/utils";
import Pagination from "@/components/Dashboard/Pagination";

export default function Trash() {
  const { trash, updateTrash, todos, updateTodos, trashMeta, trashPagination, updateTrashPagination } = useStore();
  const [loading, setLoading] = React.useState(false);

  const handlePaginationChange = async (page: number) => {
    setLoading(true);
    getTrash({
      filter: {
        page: page,
        limit: trashPagination.limit,
      },
    })
      .then((response) => response.json())
      .then((data) => {
        updateTrashPagination({ page: page, limit: trashPagination.limit });
        updateTrash({ trash: data?.data, trashMeta: data?.meta });
        setLoading(false);
      })
      .catch((err) => {
        console.log(err);
        setLoading(false);
      })
      .finally(() => {
        setLoading(false);
      });
  };

  const handleRecoverTodo = async (todoId?: string) => {
    setLoading(true);
    recoverTrashTodo(todoId)
      .then((response) => response.json())
      .then((data) => {
        console.log(data);
        // remove todo from trash state
        const recoverdTrashTodo = trash?.filter((todo) => todo._id === todoId);
        const updatedTrash = trash?.filter((todo) => todo._id !== todoId);
        updateTrash({ trash: updatedTrash });
        // add todo to todos state
        const updatedTodos = [...todos, ...recoverdTrashTodo];
        updateTodos({ todos: updatedTodos });
        setLoading(false);
      })
      .catch((err) => {
        console.log(err);
        setLoading(false);
      })
      .finally(() => {
        setLoading(false);
      });
  };

  const handleDeleteTodo = async (todoId?: string) => {
    setLoading(true);
    deleteTrashTodo(todoId)
      .then((response) => response.json())
      .then((data) => {
        console.log(data);
        // remove todo from trash state
        const updatedTrash = trash?.filter((todo) => todo._id !== todoId);
        updateTrash({ trash: updatedTrash });
        setLoading(false);
      })
      .catch((err) => {
        console.log(err);
        setLoading(false);
      })
      .finally(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    setLoading(true);
    getTrash({
      filter: {
        page: trashPagination.page,
        limit: trashPagination.limit,
      },
    })
      .then((response) => response.json())
      .then((data) => {
        updateTrash({ trash: data?.data, trashMeta: data?.meta });
      })
      .catch((err) => {
        console.log(err);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  return (
    <div>
      {loading === false &&
        trash?.map((todo) => (
          <div key={todo._id} className="flex flex-col flex-nowrap justify-start w-full h-min px-4 mb-8 bg-white rounded-md shadow-lg">
            <div className="flex flex-row flex-nowrap justify-between w-full h-12 border-b-[1px]">
              <div className="flex flex-row items-center flex-nowrap w-3/4">
                <p className="text-xl font-bold cursor-pointer">{todo.title}</p>
                <div className="ml-4 flex flex-row gap-2">
                  <button
                    onClick={() => {
                      handleRecoverTodo(todo?._id);
                    }}
                    className="text-sm text-center font-semibold text-green-900 rounded-md bg-green-200 px-2"
                  >
                    recover
                  </button>
                  <button
                    onClick={() => {
                      handleDeleteTodo(todo?._id);
                    }}
                    className="text-sm text-center font-semibold text-red-900 rounded-md bg-red-100 px-2"
                  >
                    delete
                  </button>
                </div>
              </div>
              <div className="flex flex-col flex-nowrap justify-center w-24">
                <h1
                  className={`text-sm font-bold text-center text-white p-1 rounded-3xl ${
                    todo?.status === "pending" ? "bg-red-500" : todo?.status === "completed" ? "bg-green-500" : "bg-yellow-500"
                  }`}
                >
                  {todo?.status}
                </h1>
              </div>
            </div>
            <div className="flex flex-row flex-nowrap w-full h-16 mt-2">
              <div className="flex flex-col flex-nowrap justify-center w-full h-full">
                <p className="line-clamp-3 text-clip whitespace-normal min-w-[300px] max-w-[900px]">{todo.description}</p>
              </div>
            </div>
          </div>
        ))}
      {loading == false && <Pagination currentPage={trashPagination.page} totalPages={trashMeta?.totalPages || 0} onPageChange={handlePaginationChange} />}
    </div>
  );
}
