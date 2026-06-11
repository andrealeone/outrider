import { dispatch } from './cli/dispatch'

await dispatch(process.argv.slice(2))
