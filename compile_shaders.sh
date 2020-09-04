# The GLSLX compiler doesn't support Typescript output. So this
# script uses it to output Skew shaders and hackily edits the
# output to be valid Typescript.
#
# Usage: `./compile_shaders.sh <path to glslx file> <path to output>`

node_modules/.bin/glslx "$1" --output="$2" --format=skew

# Prefix all non-empty lines with export so that it becomes a
# Typescript module
awk 'NF{print "export " $0}' "$2" > .tmp
mv .tmp $2
