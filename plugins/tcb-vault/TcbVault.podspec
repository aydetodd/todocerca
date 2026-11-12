require 'json'
package = JSON.parse(File.read(File.join(__dir__, 'package.json')))
Pod::Spec.new do |s|
  s.name = 'TcbVault'
  s.version = package['version']
  s.summary = package['description']
  s.license = package['license']
  s.homepage = 'https://todocerca.mx'
  s.author = 'TodoCerca'
  s.source = { :git => 'https://todocerca.mx', :tag => s.version.to_s }
  s.source_files = 'ios/Sources/**/*.{swift,h,m}'
  s.ios.deployment_target = '14.0'
  s.dependency 'Capacitor'
  s.swift_version = '5.9'
end