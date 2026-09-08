import React from "react";

const Pagination = ({ totalPages, currentPage, onPageChange }: { totalPages: number; currentPage: number; onPageChange: (page: number) => void }) => {
  const pageNumbers = Array.from({ length: totalPages }, (_, index) => index + 1);
  if (pageNumbers.length <= 1) {
    return null;
  }

  if (pageNumbers.length > 20) {
    return (
      <div className="flex items-center justify-center sticky bottom-2 right-0">
        {/* dynamic 1,2,3 current(4), 5,6,7,8,.... total-3, total-2, total-1,total */}
        {pageNumbers.map((page) => {
          if (page === 1 || page === 2 || page === 3) {
            return (
              <button
                key={page}
                className={`mx-1 rounded-md border-green-600 border-2 px-2 hover:bg-green-600 hover:text-white ${currentPage === page ? "bg-green-600 text-white" : ""}`}
                onClick={() => onPageChange(page)}
              >
                {page}
              </button>
            );
          }
          if (page === currentPage) {
            return (
              <button
                key={page}
                className={`mx-1 rounded-md border-green-600 border-2 px-2 hover:bg-green-600 hover:text-white ${currentPage === page ? "bg-green-600 text-white" : ""}`}
                onClick={() => onPageChange(page)}
              >
                {page}
              </button>
            );
          }
          if (page === totalPages || page === totalPages - 1 || page === totalPages - 2) {
            return (
              <button
                key={page}
                className={`mx-1 rounded-md border-green-600 border-2 px-2 hover:bg-green-600 hover:text-white ${currentPage === page ? "bg-green-600 text-white" : ""}`}
                onClick={() => onPageChange(page)}
              >
                {page}
              </button>
            );
          }
          if (page === currentPage - 1 || page === currentPage - 2 || page === currentPage + 1 || page === currentPage + 2) {
            return (
              <button
                key={page}
                className={`mx-1 rounded-md border-green-600 border-2 px-2 hover:bg-green-600 hover:text-white ${currentPage === page ? "bg-green-600 text-white" : ""}`}
                onClick={() => onPageChange(page)}
              >
                {page}
              </button>
            );
          }
          if (page === currentPage - 3 || page === currentPage + 3) {
            return (
              <button
                key={page}
                className={`mx-1 rounded-md border-green-600 border-2 px-2 hover:bg-green-600 hover:text-white ${currentPage === page ? "bg-green-600 text-white" : ""}`}
                onClick={() => onPageChange(page)}
              >
                ...
              </button>
            );
          }
          return null;
        })}
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center sticky bottom-2 right-0">
      {pageNumbers.map((page) => (
        <button
          key={page}
          className={`mx-1 rounded-md border-green-600 border-2 px-2 hover:bg-green-600 hover:text-white ${currentPage === page ? "bg-green-600 text-white" : ""}`}
          onClick={() => onPageChange(page)}
        >
          {page}
        </button>
      ))}
    </div>
  );
};

export default Pagination;
