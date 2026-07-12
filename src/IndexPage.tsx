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

          <a
            href="https://github.com/joshuahhh/draggable-diagrams"
            target="_blank"
            rel="noopener noreferrer"
            className="block w-64 px-6 py-4 text-lg text-gray-700 hover:text-gray-900 no-underline"
          >
            GitHub
          </a>
        </div>

        <div className="flex gap-8 justify-center mt-10">
          <a
            href="https://www.youtube.com/watch?v=l7v-UwpsEbk"
            target="_blank"
            rel="noopener noreferrer"
            className="flex flex-col items-center gap-2 no-underline group"
          >
            <img
              src={`${import.meta.env.BASE_URL}video-thumb.jpg`}
              alt="Video thumbnail"
              className="w-48 rounded shadow group-hover:shadow-md transition-shadow"
            />
            <span className="text-sm font-medium text-gray-700 group-hover:text-gray-900">
              Video
            </span>
          </a>

          <a
            href={`${import.meta.env.BASE_URL}dragology.pdf`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex flex-col items-center gap-2 no-underline group"
          >
            <img
              src={`${import.meta.env.BASE_URL}paper-thumb.png`}
              alt="Paper thumbnail"
              className="w-48 rounded shadow group-hover:shadow-md transition-shadow"
            />
            <span className="text-sm font-medium text-gray-700 group-hover:text-gray-900">
              Paper
            </span>
          </a>
        </div>

        <p className="text-sm text-red-600 italic mt-4">
          In submission — please do not distribute
        </p>
      </div>
      <div className="absolute bottom-4 text-xs text-gray-400 font-mono">
        {__COMMIT_HASH__}
      </div>
    </div>
  );
}
