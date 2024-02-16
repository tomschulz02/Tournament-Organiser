import 'package:flutter/material.dart';
import 'create.dart';

void main() {
  runApp(const MainApp());
}

class MainApp extends StatelessWidget {
  const MainApp({super.key});

  static const appTitle = 'Tourganiser';

  @override
  Widget build(BuildContext context) {
      return MaterialApp(
        title: appTitle,
        theme: ThemeData(
          useMaterial3: true,
          colorScheme: ColorScheme.fromSeed(
            seedColor: Colors.blue,
          ),
          textTheme: TextTheme(
            //TODO: Add a custom theme for headings, subheadings, body text, etc
          )
        ),
        home: PageLayout(title: appTitle,),
      );
  }
}

class PageLayout extends StatefulWidget {
  const PageLayout({super.key, required this.title});

  final String title;

  @override
  State<PageLayout> createState() => _PageLayoutState();
}

class _PageLayoutState extends State<PageLayout> {
  int _selectedPageIndex = 0;
  static bool _wideScreen = false;

  //List with all the pages from the drawer selection
  static const List<Widget> _detailsPageList = <Widget>[
    HomePage(),
    CreateTournamentPage(),
    LoadTournamentPage(),
  ];

  //List with the small screen versions of all the pages
  static const List<Widget> _detailsPageListSmall = <Widget>[
    HomePageSmall(),
    CreateTournamentPageSmall(),
    LoadTournamentPageSmall()
  ];

  //function for what to do when a ListTile is selected
  void _onTapped (int value) {
    //changes which page should be loaded
    setState(() {
      _selectedPageIndex = value;
    });
  }
  
  @override
  Widget build (BuildContext context) {
    _wideScreen = MediaQuery.of(context).size.width > 600 ? true : false;
    
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.title),
        backgroundColor: Colors.lightBlue,
      ),
      body: Container(
        child: _wideScreen ? _detailsPageList[_selectedPageIndex] : _detailsPageListSmall[_selectedPageIndex],
      ),
      drawer: Drawer(
        child: ListView(
          padding: EdgeInsets.zero,
          children: [
            const DrawerHeader(
              decoration: BoxDecoration(color: Color.fromRGBO(41, 182, 246, 1)),
              child: Placeholder(),
            ),
            ListTile(
              title: Text('Home'),
              leading: Icon(Icons.home_outlined),
              selected: _selectedPageIndex==0,
              onTap: () {
                _onTapped(0);
                Navigator.pop(context);
              },
            ),
            ListTile(
              title: Text('New'),
              leading: Icon(Icons.create_new_folder_outlined),
              selected: _selectedPageIndex==1,
              onTap: () {
                _onTapped(1);
                Navigator.pop(context);
              },
            ),
            ListTile(
              title: Text('Load'),
              leading: Icon(Icons.folder_open_outlined),
              selected: _selectedPageIndex==2,
              onTap: () {
                _onTapped(2);
                Navigator.pop(context);
              },
            )
          ],
        ),
      ),
    );
  }
}

class LoadTournamentPage extends StatelessWidget {
  const LoadTournamentPage({
    super.key,
  });

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Text('History'),
    );
  }
}

class LoadTournamentPageSmall extends StatelessWidget {
  const LoadTournamentPageSmall({
    super.key,
  });

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Text('Small History'),
    );
  }
}

class HomePage extends StatelessWidget {
  const HomePage({
    super.key,
  });

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Text('Welcome'),
    );
  }
}

class HomePageSmall extends StatelessWidget {
  const HomePageSmall({
    super.key,
  });

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Text('Small Welcome'),
    );
  }
}
