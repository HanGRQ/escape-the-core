import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

const VIDEO_SRC = '/assets/video/start.mp4'

/**
 * IntroVideo — full-screen opening cinematic, played once before the
 * boot terminal sequence. Click anywhere or press [ SKIP ] to skip.
 * If the video fails to load for any reason, falls straight through to
 * the boot screen rather than getting stuck on a black screen.
 */
export function IntroVideo({ onFinish }) {
  const [ended, setEnded] = useState(false)

  const finish = () => {
    if (ended) return
    setEnded(true)
    // Small delay so the fade-out transition can play before unmounting.
    setTimeout(() => onFinish?.(), 350)
  }

  return (
    <motion.div
      className="relative w-full h-screen bg-black overflow-hidden cursor-pointer"
      initial={{ opacity: 1 }}
      animate={{ opacity: ended ? 0 : 1 }}
      transition={{ duration: 0.4 }}
      onClick={finish}
    >
      <video
        className="w-full h-full object-cover"
        src={VIDEO_SRC}
        autoPlay
        muted
        playsInline
        onEnded={finish}
        onError={finish}
      />
      <AnimatePresence>
        {!ended && (
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.7 }}
            exit={{ opacity: 0 }}
            onClick={(e) => { e.stopPropagation(); finish() }}
            className="absolute bottom-8 right-8 px-5 py-2 font-display text-xs tracking-widest rounded"
            style={{ border: '1px solid #E8F4FD55', color: '#E8F4FD', background: '#00000055' }}
          >
            [ SKIP ]
          </motion.button>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
