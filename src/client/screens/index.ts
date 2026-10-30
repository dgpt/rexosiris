import { registerScreens } from '../nav'
import { auth } from './auth'
import { calibrate } from './calibrate'
import { custom } from './custom'
import { play, start } from './play'
import { select } from './select'

registerScreens({ auth, select, play, start, custom, calibrate })

export { select }
