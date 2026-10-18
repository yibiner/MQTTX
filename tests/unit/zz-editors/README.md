# Why these two spec files live in `zz-editors`

They mount the two automation editors of the connection form. Mounting a component tree in this
project's jsdom setup, *before* the Element UI specs run, breaks them: `el-select` then fails in
every later file with

    TypeError: Cannot set properties of undefined (setting 'documentHandler')

(the custom `clickoutside` directive is updated on an element it never bound). The directory name is
what makes mocha-webpack load these two last.

Measured: with these files under `tests/unit/components/` the suite reports 17 failures starting at
`connectionGroupCreation.spec.ts`; moved here it is green. Stubbing every Element UI widget and
playing the `v-model` parent with `setProps` (instead of mounting a parent component) keeps these two
files themselves from tripping the same problem.
