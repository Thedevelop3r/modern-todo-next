import Link from "next/link";
export default function GeneralFooter({ GenralNavbarLinks }: { GenralNavbarLinks: Array<{ href: string; label: string }> }) {
  return (
    <footer className="flex flex-col md:flex-row lg:flex-row items-center justify-center flex-nowrap bg-teal-900 p-6 w-full rounded-md ">
      <div className="flex items-center flex-shrink-0 text-white mb-6 md:mr-6 lg:mb-0 lg:mr-6">
        <span className={`font-semibold text-xl tracking-tight`}>Modern Todo Application</span>
      </div>
      {/* navbar */}
      <div className="flex-grow w-full h-full py-4 rounded-xl bg-teal-800 flex flex-row justify-center items-cenetr flex-wrap">
        <div className="text-sm lg:flex-grow flex flex-row flex-wrap justify-center items-end w-full">
          {GenralNavbarLinks.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className="block underline opacity-100 whitespace-nowrap mx-2 lg:inline-block rounded-md lg:mt-0 text-white px-2 py-1 hover:text-gray-200 font-semibold"
            >
              {label}
            </Link>
          ))}
        </div>
        <div className="block opacity-100 whitespace-nowrap mx-2 lg:inline-block rounded-md lg:mt-0 text-white px-2 py-1 hover:text-gray-200 font-extrabold">
          © {new Date().getFullYear()} Tekvek
        </div>
      </div>
    </footer>
  );
}
