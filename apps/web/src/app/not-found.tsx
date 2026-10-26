import Link from "next/link";
import Image from "next/image";
import { Logo } from "@/components/ui/logo";
export default function NotFound() {
  return (
    <main className="notFoundPage">
      <header className="notFoundHeader">
        <Link href="/" aria-label="Coditent home" className="notFoundLogoLink">
          <Logo size="md" />
        </Link>
      </header>

      <section className="notFoundLayout" aria-labelledby="not-found-title">
        <div className="notFoundCopy">
          <p className="notFoundEyebrow">404 · Path not found</p>
          <h1 id="not-found-title" className="notFoundTitle">
            This path <span>wandered off.</span>
          </h1>
          <p className="notFoundDescription">
            The page may have moved, or the address might be incomplete. Let&apos;s get you back to a useful place.
          </p>
          <div className="notFoundActions">
            <Link href="/" className="notFoundPrimaryAction">
              Return home
            </Link>
            <Link href="/offers/all" className="notFoundSecondaryAction">
              Browse opportunities
            </Link>
          </div>
        </div>

        <div className="notFoundArtwork" aria-hidden="true">
          <picture className="notFoundPicture">
            <source media="(prefers-reduced-motion: reduce)" srcSet="/images/system/404-cat-static.svg" />
            <Image
              className="notFoundImage"
              src="/images/system/404-cat.svg"
              alt=""
              width="950"
              height="847"
              unoptimized
              fetchPriority="high"
            />
          </picture>
        </div>
      </section>
    </main>
  );
}
