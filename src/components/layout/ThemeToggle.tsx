import { useTheme } from '../../state/theme'
import { Doodle } from './Doodle'

/** Sun/moon switch between the whiteboard (light) and chalkboard (dark). */
export function ThemeToggle() {
  const { theme, toggle } = useTheme()
  const toLight = theme === 'dark'
  return (
    <button className="iconbtn theme-toggle" onClick={toggle} aria-label={toLight ? 'Switch to whiteboard (light) theme' : 'Switch to chalkboard (dark) theme'} title={toLight ? 'whiteboard' : 'chalkboard'}>
      <Doodle name={toLight ? 'sun' : 'moon'} size={24} />
    </button>
  )
}
