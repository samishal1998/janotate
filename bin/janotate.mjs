#!/usr/bin/env node
import {main} from '../dist/server.mjs'
main().catch(error=>{console.error(error.message);process.exitCode=1})
