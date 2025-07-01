import { useState, useEffect } from 'react';

export function useIsWorldMiniApp() {
  const [isWorldMiniApp, setIsWorldMiniApp] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const checkWorldMiniApp = async () => {
      try {
        // Check if MiniKit is available
        if (typeof window !== 'undefined' && (window as any).MiniKit) {
          const MiniKit = (window as any).MiniKit;
          const isInstalled = await MiniKit.isInstalled();
          setIsWorldMiniApp(isInstalled);
        } else {
          setIsWorldMiniApp(false);
        }
      } catch (error) {
        console.error('Error checking World Mini App context:', error);
        setIsWorldMiniApp(false);
      } finally {
        setIsLoading(false);
      }
    };

    checkWorldMiniApp();
  }, []);

  return { isWorldMiniApp, isLoading };
}