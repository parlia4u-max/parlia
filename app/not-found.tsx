import Link from "next/link";

export default function NotFound() {
  return (
    <section className="foundation-page not-found-page">
      <p className="eyebrow">NOT FOUND</p>
      <h1>We couldn’t find that page</h1>
      <p>Check the address, or return to your dashboard.</p>
      <Link className="back-link" href="/">Go to dashboard</Link>
    </section>
  );
}
