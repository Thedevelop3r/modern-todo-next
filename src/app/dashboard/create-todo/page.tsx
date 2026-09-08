"use client";
import React, { useState } from "react";
import { useStore } from "@/store/state";
import { useRouter } from "next/navigation";
import { API_ENDPOINT } from "@/utils/api_endpoint";

function capitalizeEachWord(str: string) {
  return str.replace(/\w\S*/g, (w) => w.replace(/^\w/, (c) => c.toUpperCase()));
}

export default function CreateTodo() {
  const [todo, setTodo] = useState({
    title: "",
    description: "",
    status: "pending",
  });
  const router = useRouter();
  const { todos, updateTodos } = useStore();

  const handleSave = async () => {
    console.log(todo);
    // validate input
    if (todo.title.length < 1 || todo.title.length > 40) {
      alert("Title must be between 1 and 40 characters");
      return;
    }
    if (todo.description.length < 1 || todo.description.length > 1000) {
      alert("Description must be between 1 and 1000 characters");
      return;
    }
    // save todo
    const resonse = await fetch(API_ENDPOINT.todo, {
      headers: {
        "Content-Type": "application/json",
      },
      method: "POST",
      credentials: "include",
      body: JSON.stringify(todo),
    });
    if (!resonse.ok) {
      alert("Something went wrong");
      return;
    }
    const data: Todo = await resonse.json();
    console.log(data);
    // update todos
    updateTodos({
      todos: [...todos, data],
    });
    // redirect to dashboard
    router.push("/dashboard");
  };

  return (
    <div className="flex flex-col w-full h-full gap-2">
      <div className="py-2 px-2 bg-slate-200 rounded-md text-center font-bold text-2xl tracking-wider">
        <textarea
          className="text-center py-2 h-16 font-bold w-full text-4xl tracking-wider border-none outline-none focus:border-none focus:outline-none"
          value={todo.title}
          placeholder="Title"
          onChange={(e) => {
            setTodo({
              ...todo,
              title: capitalizeEachWord(e.target.value),
            });
          }}
          minLength={1}
          maxLength={40}
        />
      </div>

      <div className="py-2 px-2 bg-slate-200 rounded-md text-center font-bold text-2xl tracking-wider h-full">
        <textarea
          className="text-left font-semibold py-2 px-2 tracking-wider text-normal h-dvh w-full border-none outline-none focus:border-none focus:outline-none"
          value={todo.description}
          placeholder="Description"
          onChange={(e) => {
            setTodo({
              ...todo,
              description: e.target.value,
            });
          }}
          minLength={1}
          maxLength={1000}
        />
      </div>
      <div className="py-2 px-2 bg-slate-200 rounded-md text-center font-bold text-sm tracking-wider h-full">
        <select
          defaultValue={"pending"}
          className="text-center py-2 h-10 font-bold w-full text-lg tracking-wider border-none outline-none focus:border-none focus:outline-none"
          value={todo?.status}
          onChange={(e) => {
            setTodo({
              ...todo,
              status: e.target.value,
            });
          }}
        >
          <option value="pending">Pending</option>
          <option value="progress">In Progress</option>
          <option value="completed">Completed</option>
        </select>
      </div>
      {/* sticky save button on top right */}
      <div className="flex items-center justify-between sticky bottom-0 right-0">
        <button className="border-2 py-2 px-4 bg-green-500 text-white rounded-md text-center font-bold text-sm tracking-wider" onClick={handleSave}>
          Save
        </button>
        <div className="ml-auto pr-4">
          <div className="">Title size: {todo.title.length}/40</div>
          <div className="">Description size: {todo.description.length}/1000</div>
        </div>
      </div>
    </div>
  );
}
