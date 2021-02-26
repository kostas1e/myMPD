#
# spec file for package myMPD
#
# (c) 2018-2021 Juergen Mang <mail@jcgames.de>

Name:           mympd
Version:        6.11.3
Release:        0 
License:        GPL-2.0-or-later
Group:          Productivity/Multimedia/Sound/Players
Summary:        A standalone and mobile friendly web-based MPD client
Url:            https://jcorporation.github.io/myMPD/
Packager:       Juergen Mang <mail@jcgames.de>
Source:         mympd-%{version}.tar.gz
BuildRequires:  gcc
BuildRequires:  cmake
BuildRequires:  perl
BuildRequires:  unzip
BuildRequires:  pkgconfig
BuildRequires:  openssl-devel
BuildRequires:  libid3tag-devel
BuildRequires:	flac-devel
BuildRequires:  lua-devel
BuildRequires:  pcre-devel
BuildRoot:      %{_tmppath}/%{name}-%{version}-build

%global debug_package %{nil}

%description 
myMPD is a standalone and lightweight web-based MPD client. 
It's tuned for minimal resource usage and requires only very few dependencies.
Therefore myMPD is ideal for raspberry pis and similar devices.

%prep 
%setup -q -n %{name}-%{version}

%build
mkdir release
cd release || exit 1
cmake -DCMAKE_INSTALL_PREFIX:PATH=/usr -DCMAKE_BUILD_TYPE=RELEASE ..
make

%install
cd release || exit 1
make install DESTDIR=%{buildroot}

%post
echo "Checking status of mympd system user and group"
getent group mympd > /dev/null || groupadd -r mympd
getent passwd mympd > /dev/null || useradd -r -g mympd -s /bin/false -d /var/lib/mympd mympd
echo "myMPD installed"
echo "Modify /etc/mympd.conf to suit your needs or use the"
echo "mympd-config tool to generate a valid mympd.conf automatically."
true

%postun
if [ "$1" = "0" ]
then
  echo "Please purge /var/lib/mympd manually"
fi

%files 
%defattr(-,root,root,-)
%doc README.md
/usr/bin/mympd
/usr/bin/mympd-config
/usr/bin/mympd-script
/usr/lib/systemd/system/mympd.service
%{_mandir}/man1/mympd.1.gz
%{_mandir}/man1/mympd-config.1.gz
%{_mandir}/man1/mympd-script.1.gz
%license LICENSE
%config(noreplace) /etc/mympd.conf

%changelog
* Sat Feb 13 2021 Juergen Mang <mail@jcgames.de> 6.11.3-0
- Version from master
