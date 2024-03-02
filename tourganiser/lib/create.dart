import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

//This page asks the user for all the settings to create a competition

const double selectionFieldWidth = 200;
const double selectionFieldWidthSmall = 125;
const double selectionFieldHeight = 50;
const double edgePadding = 40;
const double edgePaddingSmall = 15;

//Error message for when a field is empty
const String _emptyErrorMsg = 'This field cannot be empty';

enum CompetitionFormat { tournament, league }
enum EliminationRound {
  roundOf16('Round of 16', 16),
  roundOf12('Round of 12', 12),
  quarterFinals('Quarterfinals', 8),
  semiFinals('Semifinals', 4),
  finals('Finals', 2);

  const EliminationRound(this.label, this.numOfTeams);
  final String label;
  final int numOfTeams;
}

//create form key
  final _createFormKey = GlobalKey<FormState>();

  //controllers for all various inputs to get values on submission
  final _compNameController = TextEditingController();
  final _numTeamsController = TextEditingController();
  final _numGroupsController = TextEditingController();

  //competition format radio group value
  CompetitionFormat? _competitionFormat = CompetitionFormat.tournament;

  //elimination round selected value
  EliminationRound? _eliminationRound = EliminationRound.roundOf16;


class CreateTournamentPage extends StatelessWidget {
  const CreateTournamentPage({
    super.key,
  });

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Create a Tournament'),
      ),
      body: CreateTournamentForm(),
    );
  }
}

class CreateTournamentForm extends StatefulWidget {
  const CreateTournamentForm({
    super.key,
  });

  @override
  State<CreateTournamentForm> createState() => _CreateTournamentFormState();
}

class _CreateTournamentFormState extends State<CreateTournamentForm> {
  
  
  //cleans up the controllers when the widget is disposed
  /*@override
  void dispose() {
    _compNameController.dispose();
    _numTeamsController.dispose();
    _numGroupsController.dispose();
    _eliminationController.dispose();
    super.dispose();
  }*/

  void submit() {
    //TODO: Add the submit function to create a new competition
    print(_compNameController.text);
    print(int.parse(_numTeamsController.text));
    print(int.parse(_numGroupsController.text));
    print(_eliminationRound!.numOfTeams);
  }
  
  @override
  Widget build(BuildContext context) {
    return ListView(
      children: [Form(
        key: _createFormKey,
        child: Column(
          mainAxisAlignment: MainAxisAlignment.start,
          children: [
            Row(
              children: [
                SizedBox(width: 15),
                Text(
                  '*required fields', 
                  style: TextStyle(fontSize: 12, color: Color.fromRGBO(255, 0, 0, 1)),
                ),
              ],
            ),
      
            //=======================================
            //Competition Name with submission button
            //=======================================
            Padding(
              padding: const EdgeInsets.fromLTRB(edgePadding, 15, edgePadding, 15),
              child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Expanded(
                      child: TextFormField(
                        decoration: InputDecoration(
                          border: OutlineInputBorder(),
                          label: Text('Name of competition*'),
                        ),
                        controller: _compNameController,
                        validator: (value) {
                          //TODO: add another condition that checks if it is a valid name
                          if (value==null || value.isEmpty) {
                            return _emptyErrorMsg;
                          }
                          return null;
                        },
                      ),
                    ),
                    SizedBox(width: 20,),
                    SizedBox(
                      width: selectionFieldWidth,
                      height: selectionFieldHeight,
                      child: ElevatedButton(
                        child: Text('Submit'),
                        onPressed: () {
                          //function for what is done with the user input on submission
                          //eventually it will lead to the backend and create a competetion class object
                          //see https://docs.flutter.dev/cookbook/forms/validation for reference
                          if (_createFormKey.currentState!.validate()) {
                            ScaffoldMessenger.of(context).showSnackBar(
                              SnackBar(content: Text('Form valid, but no submit function has been created.'))
                            );
                            submit();
                          } else {
                            ScaffoldMessenger.of(context).showSnackBar(
                              SnackBar(content: Text('There are some fields that aren\'t vaild. Please try again.'))
                            );
                          }
                        },
                      ),
                    ),
                  ],
                ),
            ),
      
            const Divider(indent: 15, endIndent: 15,),
      
            //===========================================================
            //Competition format settings (e.g. type, elimination rounds)
            //===========================================================
            Row(
              children: [
                SizedBox(width: 30,),
                Text('Choose the competition format:*', style: TextStyle(fontSize: 18),),
              ],
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 5),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Expanded(
                    child: RadioListTile(
                      title: Text('Tournament'),
                      //subtitle: Text('Group stages, into elimination rounds, ending in a final'),
                      value: CompetitionFormat.tournament,
                      groupValue: _competitionFormat, 
                      onChanged: (CompetitionFormat? value) {
                        setState(() {
                          _competitionFormat = value;
                        });
                      }
                    ),
                  ),
                  Expanded(
                    child: RadioListTile(
                      title: Text('League'),
                      //subtitle: Text('Round robin with all teams, optional elimination rounds'),
                      value: CompetitionFormat.league,
                      groupValue: _competitionFormat, 
                      onChanged: (CompetitionFormat? value) {
                        setState(() {
                          _competitionFormat = value;
                        });
                      }
                    ),
                  ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(edgePadding, 15, edgePadding, 15),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Expanded(
                    child: TextFormField(
                      controller: _numTeamsController,
                      keyboardType: TextInputType.number,
                      inputFormatters: [
                        FilteringTextInputFormatter.digitsOnly,
                      ],
                      decoration: InputDecoration(
                        border: OutlineInputBorder(),
                        labelText: 'Number of teams*',
                      ),
                      validator: (value) {
                        if (value == null || value.isEmpty){
                          return _emptyErrorMsg;
                        }
                        //TODO: add an additional validation check to make sure it is a number (That makes sense)
                        return null;
                      },
                    ),
                  ),
                  SizedBox(width: edgePadding,),
                  //Could add code that automatically decides the group size based on the number of teams
                  Expanded(
                    child: TextFormField(
                      controller: _numGroupsController,
                      keyboardType: TextInputType.number,
                      inputFormatters: [
                        FilteringTextInputFormatter.digitsOnly,
                      ],
                      decoration: InputDecoration(
                        border: OutlineInputBorder(),
                        labelText: 'Number of groups*',
                      ),
                      validator: (value) {
                        if (value == null || value.isEmpty){
                          return _emptyErrorMsg;
                        }
                        //TODO: add an additional validation check to make sure it is a number (That makes sense)
                        return null;
                      },
                    ),
                  ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(edgePadding, 5, edgePadding, 15),
              child: SizedBox(
                height: selectionFieldHeight,
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Expanded(
                      child: Text(
                        'First round of elimination*:',
                        style: TextStyle(fontSize: 15),
                      ),
                    ),
                    SizedBox(
                      width: selectionFieldWidth,
                      height: selectionFieldHeight,
                      child: EliminationDropDown(),
                    )
                  ],
                ),
              ),
            ),
      
            const Divider(indent: 15, endIndent: 15,),
          ],
        ),
      ),],
    );
  }
}

class EliminationDropDown extends StatefulWidget {
  const EliminationDropDown({
    super.key,
  });

  @override
  State<EliminationDropDown> createState() => _EliminationDropDownState();
}

class _EliminationDropDownState extends State<EliminationDropDown> {
  @override
  Widget build(BuildContext context) {
    return DropdownButtonFormField(
      value: _eliminationRound,
      decoration: InputDecoration(border: OutlineInputBorder()),
      style: TextStyle(fontSize: 12, color: Colors.black),
      onChanged: (EliminationRound? value) {
        setState(() {
          _eliminationRound = value;
        });
      },
      items: EliminationRound.values.map<DropdownMenuItem<EliminationRound>>((EliminationRound? value) {
        return DropdownMenuItem<EliminationRound>(
          value: value,
          child: Text(value!.label),
        );
      }).toList(),
      validator: (value) {
        //TODO: check if input makes sense (i.e. there are enough teams to do the selected round)
        return null;
      },
    );
  }
}

class CreateTournamentPageSmall extends StatelessWidget {
  const CreateTournamentPageSmall({
    super.key,
  });

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Create a Tournament'),
      ),
      body: CreateTournamentFormSmall(),
      floatingActionButton: SizedBox(
        width: 100,
        child: FloatingActionButton(
          onPressed: () {
            if (_createFormKey.currentState!.validate()) {
              ScaffoldMessenger.of(context).showSnackBar(
                SnackBar(content: Text('Form valid, but no submit function has been created.'))
              );
            //TODO: Submission function for button
            } else {
              ScaffoldMessenger.of(context).showSnackBar(
                SnackBar(content: Text('There are some fields that aren\'t vaild. Please try again.'))
              );
            }
          },
          child: Text("Submit"),
        ),
      ),
    );
  }
}

class CreateTournamentFormSmall extends StatefulWidget {
  @override
  State<CreateTournamentFormSmall> createState() => _CreateTournamentFormSmallState();
}

class _CreateTournamentFormSmallState extends State<CreateTournamentFormSmall> {
  @override
  Widget build (BuildContext context) {
    return ListView(
      children: [
        Form(
          key: _createFormKey,
          child: Container(
            alignment: Alignment.topLeft,
            child: Column(
              mainAxisAlignment: MainAxisAlignment.start,
              children: [
                Row(
                  children: [
                    SizedBox(width: 10,),
                    Text(
                      '*required fields', 
                      style: TextStyle(fontSize: 12, color: Color.fromRGBO(255, 0, 0, 1)),
                    ),
                  ],
                ),
                
                //======================================
                //Competition name and submission button
                //======================================
                Padding(
                  padding: const EdgeInsets.fromLTRB(edgePaddingSmall, 10, edgePaddingSmall, 10),
                  child: SizedBox(
                    height: selectionFieldHeight,
                    child: TextFormField(
                      decoration: InputDecoration(
                        border: OutlineInputBorder(),
                        label: Text('Competition name*')
                      ),
                      controller: _compNameController,
                      validator: (value) {
                        if (value == null || value.isEmpty) {
                          return _emptyErrorMsg;
                        }
                        return null;
                      },
                    ),
                  ),
                ),

                Divider(indent: 10, endIndent: 10,),

                //===================
                //Tournament settings
                //===================
                Padding(
                  padding: const EdgeInsets.fromLTRB(edgePaddingSmall, 10, edgePaddingSmall, 10),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Container(
                        alignment: Alignment.topLeft,
                        child: Text('Choose the competition format*:', style: TextStyle(fontSize: 18),),
                      ),
                      Container(
                        alignment: Alignment.topLeft,
                        height: selectionFieldHeight,
                        child: RadioListTile(
                          title: Text('Tournament'),
                          value: CompetitionFormat.tournament, 
                          groupValue: _competitionFormat, 
                          onChanged:(CompetitionFormat? value) {
                            setState(() {
                              _competitionFormat = value;
                            });
                          },
                        ),
                      ),
                      Container(
                        alignment: Alignment.topLeft,
                        height: selectionFieldHeight,
                        child: RadioListTile(
                          title: Text('League'),
                          value: CompetitionFormat.league, 
                          groupValue: _competitionFormat, 
                          onChanged: (CompetitionFormat? value) {
                            setState(() {
                              _competitionFormat = value;
                            });
                          }
                        ),
                      ),
                      SizedBox(height: 10,),
                      SizedBox(
                        height: selectionFieldHeight,
                        child: Row(
                          children: [
                            Expanded(child: Text('Number of teams*:', style: TextStyle(fontSize: 15),)),
                            SizedBox(
                              width: selectionFieldWidthSmall,
                              child: TextFormField(
                                controller: _numTeamsController,
                                keyboardType: TextInputType.number,
                                inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                                decoration: InputDecoration(border: OutlineInputBorder()),
                                validator: (value) {
                                  if (value==null || value.isEmpty){
                                    return '';
                                  }
                                  return null;
                                },
                              ),
                            ),
                          ],
                        ),
                      ),
                      SizedBox(height: 10,),
                      SizedBox(
                        height: selectionFieldHeight,
                        child: Row(
                          children: [
                            Expanded(child: Text('Number of groups*:', style: TextStyle(fontSize: 15),)),
                            SizedBox(
                              width: selectionFieldWidthSmall,
                              child: TextFormField(
                                controller: _numGroupsController,
                                keyboardType: TextInputType.number,
                                inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                                decoration: InputDecoration(border: OutlineInputBorder()),
                                validator: (value) {
                                  if (value==null || value.isEmpty){
                                    return '';
                                  }
                                  return null;
                                },
                              ),
                            ),
                          ],
                        ),
                      ),
                      SizedBox(height: 10,),
                      SizedBox(
                        height: selectionFieldHeight,
                        child: Row(
                          children: [
                            Expanded(child: Text('First round of elimination*:', style: TextStyle(fontSize: 15),),),
                            SizedBox(
                              width: selectionFieldWidthSmall,
                              height: selectionFieldHeight,
                              child: EliminationDropDown()
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
                Divider(indent: 10, endIndent: 10,),

                //=============
                //List of teams
                //=============
                Padding(
                  padding: EdgeInsets.fromLTRB(edgePaddingSmall, 10, edgePaddingSmall, 10),
                  child: Column(
                    children: [
                      Row(
                        children: [
                          Expanded(child: Text('Teams list*:', style: TextStyle(fontSize: 18),)),
                          Container(
                            alignment: Alignment.topRight,
                            child: ElevatedButton(
                              child: Text('Add'),
                              onPressed: () {
                                
                              },
                            ),
                          ),
                        ],
                      ),
                      SizedBox(height: 10,),
                      Row(
                        children: [
                          SizedBox(width: 35,),
                          Expanded(child: Text('Team name:', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),)),
                          SizedBox(width: 50, child: Text('Rank:', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),),),
                          SizedBox(width: 120,),
                        ],
                      ),
                      Container(
                        alignment: Alignment.topCenter,
                        height: 400,
                        child: ListView(
                          children: [
                            TeamListTile(name: 'Team 1', rank: 1,),
                            TeamListTile(name: 'Team 2', rank: 2,),
                            TeamListTile(name: 'Team 3', rank: 3,),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        )
      ],
    );
  }
}

class TeamListTile extends StatelessWidget {
  const TeamListTile ({
    super.key,
    required this.name,
    required this.rank,
  });

  final String name;
  final int rank;

  @override
  Widget build (BuildContext context) {
    return Container(
      padding: EdgeInsets.fromLTRB(0, 0, 0, 5),
      height: 50,
      child: Row(
        children: [
          Icon(Icons.people, size: 25,),
          SizedBox(width: 10),
          Expanded(child: Text(name, style: TextStyle(fontSize: 16),)),
          SizedBox(
            width: 50,
            child: Center(
              child: Text(
                '$rank'
              ),
            ),
          ),
          SizedBox(width: 20,),
          IconButton(
            icon: Icon(Icons.edit, size: 30),
            onPressed: () {
              print('Edit');
              //TODO: Add a popup with a textfield and a number chooser (textfield or dropdown)
            },
          ),
          SizedBox(width: 10,),
          IconButton(
            icon: Icon(Icons.remove_circle_outline, color: Colors.red, size: 30,),
            onPressed: () {
              print('Remove');
              //TODO: Add a function that removes the team from the list
            },
          ),
        ],
      ),
    );
  }
}