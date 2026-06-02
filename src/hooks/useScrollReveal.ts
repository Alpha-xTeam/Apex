import { useEffect } from 'react';

interface RevealOptions {
  selector?: string;
  rootMargin?: string;
  threshold?: number;
  once?: boolean;
}

/**
 * Adds an `is-revealed` class to all elements matching `selector`
 * when they enter the viewport. Elements start with `data-reveal` attribute.
 */
export function useScrollReveal(options: RevealOptions = {}) {
  const {
    selector = '[data-reveal]',
    rootMargin = '0px 0px -60px 0px',
    threshold = 0.1,
    once = true,
  } = options;

  useEffect(() => {
    const elements = document.querySelectorAll<HTMLElement>(selector);
    if (!elements.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const el = entry.target as HTMLElement;
            const delay = parseInt(el.dataset.revealDelay || '0', 10);
            setTimeout(() => el.classList.add('is-revealed'), delay);
            if (once) observer.unobserve(el);
          } else if (!once) {
            (entry.target as HTMLElement).classList.remove('is-revealed');
          }
        });
      },
      { rootMargin, threshold }
    );

    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [selector, rootMargin, threshold, once]);
}
