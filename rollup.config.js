import svelte from "rollup-plugin-svelte";
import resolve from "rollup-plugin-node-resolve";
import commonjs from "rollup-plugin-commonjs";
import { terser } from "rollup-plugin-terser";
import typescript from "rollup-plugin-typescript2";
import tscompile from "typescript";
import { ts } from "./svelte.config";

import sass from 'node-sass';

// eslint-disable-next-line no-undef
const production = !process.env.ROLLUP_WATCH;
const buildDir = production ? 'dist' : 'public';

export default [
  {
    input: 'src/main.ts', 
    output: {
      sourcemap: true,  
      format: 'iife',
      file: `${buildDir}/bundle.js`,
      name: 'app'
    },
    plugins: [
      commonjs({ include: "node_modules/**" }),
      typescript({ typescript: tscompile }),
      svelte({
        // enable run-time checks when not in production
        dev: !production,
        // we'll extract any component CSS out into
        // a separate file — better for performance
        css: css => {
          css.write(`${buildDir}/bundle.css`);
        },

        preprocess: {
          ts,
          style: ({ content, attributes }) => {
            if (attributes.type !== 'text/scss') return;

            return new Promise((fulfill, reject) => {
              sass.render({
                data: content,
                includePaths: ['src', 'node_modules'],
                sourceMap: true,
                outFile: 'x', // this is necessary, but is ignored
              }, (err, result) => {
                if (err) return reject(err);

                fulfill({
                    code: result.css.toString(),
                    map: result.map.toString(),
                });
              });
            });
          },
        }
      }),
      resolve(),

      production && terser()
    ],
    watch: {
      clearScreen: false
    }
  },

  // drawers
  {
    input: 'src/frames/drawer2.ts',
    output: {
      sourcemap: true,  
      file: `${buildDir}/drawer2.js`,
      format: 'iife',
      name: 'drawer2'
    },
    plugins: [
      typescript({ typescript: tscompile }),
      resolve(),
      commonjs({
        namedExports: {
          svelte: ['create', 'compile']
        }
      }),
      svelte({
        dev: !production,
      })
    ]
  },
  {
    input: 'src/frames/drawer.ts',
    output: {
      sourcemap: true,  
      file: `${buildDir}/drawer.js`,
      format: 'iife',
      name: 'drawer'
    },
    plugins: [
      typescript({ typescript: tscompile }),
      resolve(),
      commonjs({
        namedExports: {
          svelte: ['create', 'compile']
        }
      }),
      svelte({
        dev: !production,
      })
    ]
  }
];