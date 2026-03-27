import { Link } from "react-router-dom";
import { useTitle } from "../useTitle";

// Import all .mdx files from docs directory
const mdxFiles = import.meta.glob("./*.mdx");

export function DocsIndexPage() {
  useTitle("Docs — Dragology");
  // Extract slugs from file paths
  const slugs = Object.keys(mdxFiles)
    .map((path) => {
      const match = path.match(/\.\/(.+)\.mdx$/);
      return match ? match[1] : null;
    })
    .filter((slug): slug is string => slug !== null)
    .sort();

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-6 py-12">
        <Link
          to="/"
          className="inline-block mb-4 text-sm text-gray-600 hover:text-gray-800 no-underline"
        >
          ← Back to home
        </Link>
        <h1 className="text-3xl font-normal text-gray-800 mb-6">
          Documentation
        </h1>
        <div className="bg-white rounded-lg shadow-sm p-8">
          <ul className="space-y-3">
            {slugs.map((slug) => (
              <li key={slug}>
                <Link
                  to={`/docs/${slug}`}
                  className="text-blue-600 hover:text-blue-800 underline text-lg"
                >
                  {slug}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
