import { useCallback, useEffect, useRef, useState } from 'react';

interface UseInViewOptions {
  threshold?: number;
  rootMargin?: string;
  triggerOnce?: boolean;
}

/**
 * Hook для отслеживания видимости элемента через IntersectionObserver.
 * Возвращает callback ref и boolean-флаг видимости.
 */
export function useInView({
  threshold = 0.1,
  rootMargin = '0px 0px -60px 0px',
  triggerOnce = true,
}: UseInViewOptions = {}): [(node: HTMLDivElement | null) => void, boolean] {
  const [inView, setInView] = useState(false);
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    return () => {
      observerRef.current?.disconnect();
    };
  }, []);

  const callbackRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }

      if (!node) return;

      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            setInView(true);
            if (triggerOnce) {
              observer.unobserve(node);
            }
          } else if (!triggerOnce) {
            setInView(false);
          }
        },
        { threshold, rootMargin },
      );

      observer.observe(node);
      observerRef.current = observer;
    },
    [threshold, rootMargin, triggerOnce],
  );

  return [callbackRef, inView];
}
