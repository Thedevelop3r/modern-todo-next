import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-between py-10 bg-slate-100">
      {/* card with modern todo app into */}
      <div className="bg-white shadow-lg rounded-lg min-w-1/3 w-[900px] max-w-[90%] px-4 py-5">
        <h1 className="text-6xl font-bold text-gray-700 mt-4 mb-10 border-b-2 border-teal-500">MODERN TODO APP</h1>
        <p className="text-3xl text-blue-500 font-semibold">
          Manage Your Personal Todos With Ease,
          <br /> Easily Share Them Across Contacts.
        </p>
        <p className="text-lg font-semibold text-slate-600 mt-4 mb-10">Unique todos with line items, costs analysis and many more features.</p>
        <div className="flex flex-row gap-2 mt-2">
          <Link href="/login" className="text-white border-2 border-indigo-500 hover:text-indigo-500 hover:bg-white font-bold bg-indigo-500 p-4 rounded-md">
            Get Started
          </Link>
          <Link href="/learn-more" className="text-black border-2 hover:bg-yellow-700 font-bold bg-yellow-400 p-4 rounded-md">
            Learn More
          </Link>
        </div>
      </div>
    </main>
  );
}
