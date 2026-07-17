import { Link } from "react-router";

export default function NotFound() {
  return <main className="min-h-screen grid place-items-center bg-background"><div className="text-center"><h1 className="text-4xl font-bold">404</h1><Link className="text-primary underline" to="/">Return home</Link></div></main>;
}
