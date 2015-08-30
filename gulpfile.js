var fs          = require('fs');
var gulp        = require('gulp');
var runSequence = require('run-sequence');

// Project plugins
var rev          = require('gulp-rev');
var sass         = require('gulp-ruby-sass');
var clean        = require('gulp-clean');
var concat       = require('gulp-concat');
var rename       = require('gulp-rename');
var replace      = require('gulp-replace-task');
var collect      = require('gulp-rev-collector');
var imagemin     = require('gulp-imagemin');
var pngquant     = require('imagemin-pngquant');
var uglify       = require('gulp-uglify');
var minifyCss    = require('gulp-minify-css');
var awspublish   = require('gulp-awspublish');
var autoprefixer = require('gulp-autoprefixer');

// Configuration
var config = JSON.parse(fs.readFileSync('./gulp.json'));
var themePath = 'wp-content/themes/' + config.theme;
var distPath  = themePath + '/dist';
var assetPath = themePath + '/assets';
var revision = Math.floor(Date.now() / 1000);


gulp.task(
  'default',
  [
    'compile-styles',
    'compile-scripts',
    'compile-fonts',
    'compile-images',
    'compile-templates'
  ],
  function() {
    gulp.watch(assetPath + '/sass/**/*.scss',  ['compile-css']);
    gulp.watch(assetPath + '/scripts/**/*.js', ['compile-js']);
    gulp.watch(assetPath + '/fonts/**/*',      ['compile-fonts']);
    gulp.watch(assetPath + '/images/**/*',     ['compile-images']);
    gulp.watch(assetPath + '/templates/**/*',  ['compile-templates']);
  }
);

gulp.task('deploy', function (callback) {
  runSequence(
    'clean',
    ['compile-styles', 'compile-scripts', 'compile-images', 'compile-fonts', 'compile-templates'],
    ['optimize-styles', 'optimize-scripts', 'optimize-images'],
    'version-assets',
    ['replace-versisonned-assets-in-assets', 'replace-versisonned-assets-in-templates'],
    'gzip-assets',
    'publish-to-s3',
    callback
  );
});

gulp.task('clean', function () {
  return gulp.src(distPath, {read: false})
    .pipe(clean({force: true}));
});



// Styles
// ------

gulp.task('compile-styles', function () {
  return (
    sass(assetPath + '/sass/', {
      sourcemap: true
    }).on('error', function (err) { console.error('Error!', err.message); })
    .pipe(autoprefixer({
        browsers: ['last 2 versions'],
        cascade: false
    }))
    .pipe(gulp.dest(distPath + '/css'))
  );
});

gulp.task('optimize-styles', function () {
  return gulp.src(distPath + '/css/style.css')
    .pipe(minifyCss())
    .pipe(gulp.dest(distPath + '/css'));
});



// Scripts
// -------

gulp.task('compile-scripts', function () {
  return (
    gulp.src([
      assetPath + '/scripts/script.js'
    ])
    .pipe(concat('script.js'))
    .pipe(gulp.dest(distPath + '/js'))
  );
});

gulp.task('optimize-scripts', function () {
  return gulp.src(distPath + '/js/script.js')
    .pipe(uglify())
    .pipe(gulp.dest(distPath + '/js/'));
});



// Images
// -------

gulp.task('compile-images', function () {
  return gulp.src(assetPath + '/images/**/*')
    .pipe(gulp.dest(distPath + '/images'));
});

gulp.task('optimize-images', function () {
  return gulp.src(distPath + '/images/**/*')
    .pipe(imagemin({
      progressive: true,
      svgoPlugins: [{removeViewBox: false}],
      use: [pngquant()]
    }))
    .pipe(gulp.dest(distPath + '/images'));
});



// Fonts
// -----

gulp.task('compile-fonts', function () {
  return gulp.src(assetPath + '/fonts/**/*')
    .pipe(gulp.dest(distPath + '/fonts'));
});



// Templates
// ---------

gulp.task('compile-templates', function () {
  return gulp.src(assetPath + '/templates/**/*')
    .pipe(gulp.dest(themePath));
});



// Versionning
// -----------

gulp.task('version-assets', function () {
  return gulp.src(distPath + '/**/*')
    .pipe(rev())
    .pipe(gulp.dest(distPath))
    .pipe(rev.manifest())
    .pipe(gulp.dest(themePath));
});

gulp.task('replace-versionned-assets-in-assets', function () {
  return gulp.src([
      themePath + '/**/*.json',
      distPath + '/**/*.css',
      distPath + '/**/*.js'
    ])
    .pipe(collect({
      replaceReved: true,
      dirReplacements: {
        '/wp-content/themes/visible/dist': config.productionAssetURL
      }
    }))
    .pipe(gulp.dest(distPath));
});

gulp.task('replace-versisonned-assets-in-templates', function () {
  return gulp.src([
      themePath + '/**/*.json',
      themePath + '/*.php'
    ])
    .pipe(collect({
      replaceReved: true,
      dirReplacements: {
        '/wp-content/themes/visible/dist': config.productionAssetURL
      }
    }))
    .pipe(gulp.dest(themePath));
});



// S3
// --

gulp.task('gzip-assets', function () {
  return gulp.src([
      '!' + distPath + '/**/*.gz',
      distPath + '/**/*'
    ])
    .pipe(awspublish.gzip({ ext: '.gz' }))
    .pipe(gulp.dest(distPath));
});

gulp.task('publish-to-s3', function () {
  var publisher = awspublish.create(config.aws);
  var headers = {
    'Cache-Control': 'max-age=31536000, no-transform, public'
  };

  return gulp.src(distPath + '/**')
    .pipe(publisher.publish(headers))
    .pipe(publisher.sync())
    .pipe(awspublish.reporter());
});
