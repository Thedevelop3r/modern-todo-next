"use client";
import Link from "next/link";
import React from "react";
import { useStore } from "@/store/state";
import { getAllTodos, deleteTodo, STATUS_MAP } from "@/utils";
import Pagination from "@/components/Dashboard/Pagination";

// TODO: 1. add pagination, 2. add filter - acc-decend client-server, 3. add search == pending

export default function Dashboard() {
  const [loading, setLoading] = React.useState(false);
  const { todos, updateTodos, todoPagination, updatePagination, todoMeta } = useStore();

  const handlePaginationChange = async (page: number) => {
    setLoading(true);
    updatePagination({ page: page, limit: todoPagination.limit });
    getAllTodos({
      filter: {
        page: page,
        limit: todoPagination.limit,
      },
    })
      .then((response) => response.json())
      .then((data) => {
        updateTodos({ todos: data?.data, todoMeta: data?.meta });
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
  const handleResetPaginationChange = async () => {
    updatePagination({ page: 1, limit: todoPagination.limit });
    getAllTodos({
      filter: {
        page: 1,
        limit: todoPagination.limit,
      },
    })
      .then((response) => response.json())
      .then((data) => {
        updateTodos({ todos: data?.data, todoMeta: data?.meta });
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

  const handleGetAllTodos = async () => {
    setLoading(true);
    getAllTodos({
      filter: {
        page: todoPagination.page,
        limit: todoPagination.limit,
      },
    })
      .then((response) => response.json())
      .then((data) => {
        updateTodos({ todos: data?.data, todoMeta: data?.meta });
        setLoading(false);
      })
      .catch((err) => {
        console.log(err);
        setLoading(false);
      });
  };

  const handleRefreshTodos = async () => {
    setLoading(true);
    getAllTodos({
      filter: {
        page: todoPagination.page,
        limit: todoPagination.limit,
      },
    })
      .then((response) => response.json())
      .then((data) => {
        updateTodos({ todos: data?.data, todoMeta: data?.meta });
        setLoading(false);
      })
      .catch((err) => {
        console.log(err);
        setLoading(false);
      });
  };

  const handleDeleteTodo = async (todoId: string | undefined) => {
    setLoading(true);
    deleteTodo(todoId)
      .then((response) => response.json())
      .then(handleGetAllTodos)
      .catch((err) => {
        console.log(err);
        setLoading(false);
      })
      .finally(() => {
        setLoading(false);
      });
  };

  return (
    <div className={`flex flex-col flex-nowrap w-full h-full`}>
      <div className="flex flex-row flex-nowrap justify-between items-center w-full h-12 px-4 mb-10 border-b-2 py-2">
        <h1 className="text-2xl font-bold">Todos</h1>
        <div>
          <button className="mx-2 rounded-md border-green-600 border-2 py-1 px-6 hover:bg-green-600 hover:text-white" onClick={handleRefreshTodos}>
            Refresh
          </button>
          <button className="rounded-md border-yellow-600 border-2 py-1 px-1 hover:bg-yellow-600 hover:text-white" onClick={handleResetPaginationChange}>
            Reset
          </button>
          <Link href={"/dashboard/create-todo"} className="mx-2 self-end text-center bg-green-600 rounded-md py-2 px-6 w-36 text-white font-bold tracking-wide hover:bg-green-700">
            New
          </Link>
        </div>
      </div>
      {/* Todos */}
      <div className="flex flex-col flex-nowrap w-full h-full overflow-y-auto">
        {loading == false &&
          todos?.map((todo) => (
            <div key={todo._id} className="flex flex-col flex-nowrap justify-start w-full h-min px-4 mb-8 bg-white rounded-md shadow-lg">
              <div className="flex flex-row flex-nowrap justify-between w-full h-12 border-b-[1px]">
                <div className="flex flex-row items-center flex-nowrap w-3/4">
                  <Link href={`/dashboard/todo/${todo._id}`} className="text-xl font-bold hover:text-gray-500 cursor-pointer hover:underline">
                    {todo.title}
                  </Link>
                  <div className="ml-4 flex flex-row gap-2">
                    <Link className="text-sm text-center font-semibold text-gray-900 rounded-md bg-gray-200 px-2" href={"/dashboard/edit-todo/" + todo._id}>
                      edit
                    </Link>
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
                  <h1 className={`text-sm font-bold text-center text-white p-1 rounded-3xl ${todo?.status === "pending"? "bg-red-500" : todo?.status === "completed" ? "bg-green-500" : "bg-yellow-500"   }`}>{todo?.status}</h1>
                </div>
              </div>
              <div className="flex flex-row flex-nowrap w-full h-16 mt-2">
                <div className="flex flex-col flex-nowrap justify-center w-full h-full">
                  <p className="line-clamp-3 text-clip whitespace-normal min-w-[300px] max-w-[900px]">{todo.description}</p>
                </div>
              </div>
            </div>
          ))}
      </div>
      {loading == false && <Pagination currentPage={todoPagination.page} totalPages={todoMeta?.totalPages || 0} onPageChange={handlePaginationChange} />}
    </div>
  );
}
