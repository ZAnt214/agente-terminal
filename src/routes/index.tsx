import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/")({ component: Home })

function Home() {
  return (
    <main className="fixed inset-0 flex items-center justify-center overflow-hidden bg-white px-4">
      <section
        className="flex w-full flex-col items-center text-center"
        role="status"
        aria-labelledby="loading-title"
      >
        <div className="relative size-22" aria-hidden="true">
          <img className="block size-full" src="/loading-window.svg" alt="" />
          <img
            className="absolute top-[37px] left-[23px] size-[25px]"
            src="/loading-star.svg"
            alt=""
          />
          <img
            className="loading-star-spin absolute top-[35px] left-[52px] size-[13px]"
            src="/loading-star.svg"
            alt=""
          />
        </div>

        <p
          id="loading-title"
          className="m-0 mt-2 whitespace-nowrap text-sm leading-[1.2] font-normal text-[#999999]"
        >
          Loading the magic...
        </p>
      </section>
    </main>
  )
}
