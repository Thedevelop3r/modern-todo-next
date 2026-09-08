import { usePathname } from "next/navigation";
import Link from "next/link";

export default function GeneralHeader({ navLinks }: { navLinks: Array<{ href: string; label: string }> }) {
  const path = usePathname();
  return (
    <nav className="flex items-center justify-between flex-nowrap bg-teal-900 p-6 w-full">
      <div className="flex items-center flex-shrink-0 text-white mr-6">
        <Link href="/">
          <span className={`font-semibold text-xl tracking-tight`}>TODO</span>
        </Link>
      </div>
      {/* navbar */}
      <div className="flex-grow w-full h-full py-4 rounded-xl bg-teal-800 flex flex-row justify-center items-end flex-nowrap">
        <div className="text-sm lg:flex-grow flex flex-row flex-nowrap justify-center items-end w-full"></div>
        {navLinks.map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            className={`block opacity-100 whitespace-nowrap mx-2 lg:inline-block rounded-md lg:mt-0 ${path == href ? "text-black" : "text-white"} px-2 py-1 ${
              path == href ? "bg-white" : "hover:text-gray-200"
            } font-semibold`}
          >
            {label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
