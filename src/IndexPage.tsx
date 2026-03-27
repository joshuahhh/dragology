import { Link } from "react-router-dom";
import { useTitle } from "./useTitle";

export function IndexPage() {
  useTitle("Dragology");
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center">
      <div className="text-center py-10 px-5 max-w-3xl mx-auto">
        <h1 className="text-4xl font-normal text-gray-800 mb-12">Dragology</h1>

        <div className="flex flex-col gap-4 items-center">
          <Link
            to="/study"
            className="block w-64 px-6 py-4 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors no-underline text-center font-medium"
          >
            Study
          </Link>

          <Link
            to="/demos"
            className="block w-64 px-6 py-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors no-underline text-center font-medium"
          >
            Demos
          </Link>

          <Link
            to="/docs"
            className="block w-64 px-6 py-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors no-underline text-center font-medium"
          >
            Documentation
          </Link>

          <a
            href="https://github.com/joshuahhh/draggable-diagrams"
            target="_blank"
            rel="noopener noreferrer"
            className="block w-64 px-6 py-4 text-lg text-gray-700 hover:text-gray-900 no-underline"
          >
            GitHub
          </a>
        </div>
      </div>
      <div className="absolute bottom-4 text-xs text-gray-400 font-mono">
        {__COMMIT_HASH__}
      </div>
    </div>
  );
}
