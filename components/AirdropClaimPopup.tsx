import { useState, useEffect } from 'react';
import { Dialog, DialogContent } from './ui/dialog';
import { Button } from './ui/button';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, Check, XCircle } from 'lucide-react';
import { toast } from 'sonner';

interface AirdropClaimPopupProps {
  isOpen: boolean;
  onClose: () => void;
  onClaim: () => Promise<void>;
  isEligible: boolean;
  isTestUser?: boolean;
}

export function AirdropClaimPopup({ isOpen, onClose, onClaim, isEligible, isTestUser = false }: AirdropClaimPopupProps) {
  const [claimState, setClaimState] = useState<'idle' | 'claiming' | 'success' | 'error'>('idle');

  // Reset state when dialog opens
  useEffect(() => {
    if (isOpen) {
      setClaimState('idle');
    }
  }, [isOpen]);

  const handleClaim = async () => {
    try {
      setClaimState('claiming');
      await onClaim();
      setClaimState('success');
      
      // Auto close after success animation completes
      setTimeout(() => {
        onClose();
      }, 3000);
    } catch (error) {
      console.error('Claim error:', error);
      setClaimState('error');
      toast.error('Failed to claim tokens. Please try again.');
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md bg-gradient-to-br from-amber-50 to-orange-100 dark:from-zinc-900 dark:to-zinc-800 border-amber-200 dark:border-amber-800">
        <div className="flex flex-col items-center justify-center p-4 text-center space-y-6">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", duration: 0.5 }}
            className="w-32 h-32 rounded-full bg-amber-500 flex items-center justify-center mb-2"
          >
            <img 
              src="/qrLogo.png" 
              alt="QR Token" 
              className="w-24 h-24"
            />
          </motion.div>

          <motion.h2 
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="text-2xl font-bold text-gray-900 dark:text-gray-100"
          >
            {!isEligible 
              ? 'You have already claimed' 
              : claimState === 'success' 
                ? 'Claim Successful!' 
                : isTestUser
                  ? 'Test User: Claim Your $QR Tokens'
                  : 'Claim Your $QR Tokens'}
          </motion.h2>

          <motion.p
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="text-gray-700 dark:text-gray-300"
          >
            {!isEligible 
              ? 'Thank you for your support!' 
              : claimState === 'success' 
                ? '100,000 $QR tokens have been sent to your wallet!' 
                : isTestUser
                  ? 'TEST MODE: No actual tokens will be sent'
                  : 'Get 100,000 $QR tokens for adding our mini app!'}
          </motion.p>

          <AnimatePresence mode="wait">
            {claimState === 'success' ? (
              <motion.div
                key="success"
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0, opacity: 0 }}
                className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center"
              >
                <Check className="h-10 w-10 text-green-600 dark:text-green-400" />
              </motion.div>
            ) : claimState === 'error' ? (
              <motion.div
                key="error"
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0, opacity: 0 }}
                className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-900 flex items-center justify-center"
              >
                <XCircle className="h-10 w-10 text-red-600 dark:text-red-400" />
              </motion.div>
            ) : null}
          </AnimatePresence>

          {isEligible && claimState !== 'success' && (
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.4 }}
              className="w-full flex justify-center space-x-4"
            >
              <Button 
                variant="default" 
                className="bg-amber-500 hover:bg-amber-600 text-white"
                onClick={handleClaim}
                disabled={claimState === 'claiming'}
              >
                {claimState === 'claiming' ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Claiming...</>
                ) : claimState === 'error' ? (
                  'Try Again'
                ) : isTestUser ? (
                  'Test Claim'
                ) : (
                  'Claim Now'
                )}
              </Button>
            </motion.div>
          )}

          {!isEligible && (
            <Button 
              variant="default" 
              className="bg-amber-500 hover:bg-amber-600 text-white"
              onClick={onClose}
            >
              Continue
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
} 